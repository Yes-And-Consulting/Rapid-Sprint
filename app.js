const STORAGE_KEY = "rapidSprint.v2";
const AUTH_STORAGE_KEY = "rapidSprint.auth.v1";

const ROLE = {
  FACILITATOR: "facilitator",
  HUMAN: "human",
};

const FALLBACK_PAGES_URL = "https://yes-and-consulting.github.io/Rapid-Sprint/";
const RAW_API_BASE = new URLSearchParams(window.location.search).get("api") || window.RAPIDSPRINT_API_BASE || "";
const API_BASE = RAW_API_BASE.replace(/\/$/, "");

const STAGES = {
  HOME: "home",
  CREATE: "create",
  REVIEW_QUESTIONS: "review_questions",
  INTERVIEWS: "interviews",
  IDEAS: "ideas",
  VOTING: "voting",
  PROTOTYPE: "prototype",
};

const facilitatorFlow = [
  [STAGES.HOME, "Home"],
  [STAGES.CREATE, "Create Sprint"],
  [STAGES.REVIEW_QUESTIONS, "Review & Edit Interview Questions"],
  [STAGES.INTERVIEWS, "Interview Stage"],
  [STAGES.IDEAS, "Generated Ideas"],
  [STAGES.VOTING, "Voting Live"],
  [STAGES.PROTOTYPE, "Prototype & Export"],
];

const humanFlow = [
  "Waiting Room",
  "Interview Question 1",
  "Interview Question 2",
  "Interview Question 3",
  "Submit Interview",
  "After Submit / Waiting",
  "Idea Voting",
  "Prototype & Done",
];

const FACILITATOR_PASSWORDS = [
  "north-cedar-47",
  "bright-river-82",
  "steady-maple-19",
  "silver-harbor-64",
  "quiet-signal-31",
  "open-canyon-58",
  "clear-meadow-26",
  "warm-anchor-73",
  "fresh-lantern-95",
  "solid-compass-40",
];

const promptLibrary = {
  generateInterviewQuestions: {
    id: "generate_interview_questions",
    version: "1.0.0",
    inputs: {
      challenge: "Description or focus question entered by the facilitator.",
    },
    template: `You are a senior UX researcher preparing a rapid empathy interview.

Your job is to synthesize the facilitator's challenge into three excellent interview questions. Treat the challenge as raw notes from a human, not as polished research wording.

First, infer silently:
- who the likely participant is
- what activity, workflow, service, or moment is being studied
- what outcome or friction the facilitator probably cares about
- what concrete words from the challenge should appear in the questions

Then generate exactly three questions:
1. Bright Spots: a question about a specific recent moment that worked better than expected.
2. Pain Points: a question about a specific recent moment where the participant got stuck, slowed down, confused, or frustrated.
3. Improvements: a question about what would have made that same kind of moment easier, clearer, faster, or more useful.

Quality bar:
- Sound like a thoughtful researcher wrote them after reading the challenge carefully.
- Use concrete nouns from the challenge; do not say "this experience" unless the challenge is truly empty.
- Ask for a recent story, example, moment, or situation.
- Make each question answerable by a real participant, not by the facilitator.
- Avoid generic phrases like "what is working well" unless tied to the specific context.
- Do not suggest features, solutions, surveys, rankings, metrics, or yes/no answers.
- Keep each question under 28 words.
- Return only valid JSON.

Challenge:
{{challenge}}

Expected JSON:
{
  "questions": [
    {
      "type": "bright_spots",
      "title": "Bright Spots",
      "question": ""
    },
    {
      "type": "pain_points",
      "title": "Pain Points",
      "question": ""
    },
    {
      "type": "future_improvements",
      "title": "Improvements",
      "question": ""
    }
  ]
}`,
    expectedJson: {
      questions: [
        { type: "bright_spots", title: "Bright Spots", question: "" },
        { type: "pain_points", title: "Pain Points", question: "" },
        { type: "future_improvements", title: "Improvements", question: "" },
      ],
    },
  },
  generateIdeas: {
    id: "generate_ideas",
    version: "1.0.0",
    inputs: {
      challenge: "...",
      interview_questions: [],
      responses: [],
    },
    template: `You are an expert service designer, facilitator, and innovation strategist.

Your job is to analyze interview responses from a rapid design sprint and generate actionable ideas that address the needs, frustrations, and opportunities expressed by Humans.

The ideas will immediately be reviewed by the Facilitator and then presented to Humans for voting, so they should be easy to understand, meaningfully different from one another, and useful for discussion.

Challenge:
{{challenge}}

Interview Questions:
{{interview_questions}}

Interview Responses:
{{responses}}

Analyze all interview responses and synthesize the strongest patterns before writing ideas.

Look for:
- recurring needs
- pain points
- bright spots worth expanding
- unmet needs
- bottlenecks
- workarounds
- opportunities
- unexpected insights
- repeated requests
- ideas that multiple Humans are pointing toward

Generate exactly 10 ideas.

Each idea should:
- directly relate to the challenge and interview data
- be grounded in a clear evidence pattern, not a generic workshop idea
- solve a meaningful problem
- be understandable in under 10 seconds
- be distinct from every other idea
- avoid duplicates
- avoid vague business jargon
- avoid implementation details
- avoid simply restating the interview question
- be suitable for voting
- be broad enough for Facilitators to edit, merge, split, rename, remove, or add to before voting

For each idea provide:
- short title
- one-sentence description
- confidence score based on evidence

Confidence:
High = multiple Humans support this idea.
Medium = some evidence exists but interpretation was required.
Low = interesting opportunity with limited evidence.

Return only valid JSON.

Expected JSON:
{
  "ideas": [
    {
      "id": 1,
      "title": "",
      "description": "",
      "confidence": "High"
    }
  ]
}`,
    expectedJson: {
      ideas: [{ id: 1, title: "", description: "", confidence: "High" }],
    },
  },
};

const ideaSeeds = [
  ["Simpler first step", "Make the first action obvious and easy to complete."],
  ["Clear progress cues", "Show what has happened, what is happening now, and what comes next."],
  ["Better handoff moments", "Help people pass context forward without repeating themselves."],
  ["Faster support path", "Give Humans a quicker way to get unstuck when friction appears."],
  ["Plain-language guidance", "Replace confusing moments with concise prompts that explain the next decision."],
  ["Personalized defaults", "Use known context to reduce repeated entry and setup effort."],
  ["Visible confirmation", "Make successful actions feel reliable with timely, specific confirmations."],
  ["Flexible timing", "Let Humans complete key steps in a rhythm that fits their real situation."],
  ["Shared decision view", "Create one place where options, tradeoffs, and decisions are easy to compare."],
  ["Recovery path", "Make it easy to revise, undo, or recover when something goes wrong."],
];

const state = loadState();
const authState = loadAuthState();
let speechRecognition = null;
let isTranscribing = false;
let currentRecordingQuestionId = "";
let syncTimerId = null;
let sprintSaveTimerId = null;
let isApplyingRemoteSprint = false;
let apiAvailable = false;

function createSprint(overrides = {}) {
  const id = overrides.id || uid("sprint");
  return {
    id,
    title: overrides.title || "Rapid Sprint",
    challenge: overrides.challenge || "",
    duration: overrides.duration || 45,
    inviteLink: overrides.inviteLink || makeInviteLink(id, STAGES.INTERVIEWS),
    currentStage: overrides.currentStage || STAGES.HOME,
    interviewQuestions: overrides.interviewQuestions || [],
    interviewResponses: overrides.interviewResponses || [],
    generatedIdeas: overrides.generatedIdeas || [],
    facilitatorAddedIdeas: overrides.facilitatorAddedIdeas || [],
    votes: overrides.votes || [],
    selectedIdea: overrides.selectedIdea || null,
    updatedAt: overrides.updatedAt || "",
  };
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    return normalizeState(JSON.parse(saved));
  }

  return normalizeState({
    role: ROLE.FACILITATOR,
    sprint: createSprint(),
    humanSessionId: uid("human"),
    humanDraft: {
      responses: {},
      speakerName: "",
      submitted: false,
    },
  });
}

function normalizeState(raw) {
  if (raw.sprint) {
    return {
      role: raw.role || ROLE.FACILITATOR,
      sprint: createSprint(raw.sprint),
      humanSessionId: raw.humanSessionId || uid("human"),
      humanDraft: raw.humanDraft || { responses: {}, speakerName: "", submitted: false },
    };
  }

  const legacyQuestions = String(raw.questions || "")
    .split("\n")
    .filter(Boolean)
    .map((question, index) => ({
      id: `q${index + 1}`,
      type: ["bright_spots", "pain_points", "future_improvements"][index] || "future_improvements",
      title: ["Bright Spots", "Pain Points", "Improvements"][index] || `Question ${index + 1}`,
      question,
    }))
    .slice(0, 3);

  return {
    role: raw.mode === "participant" ? ROLE.HUMAN : ROLE.FACILITATOR,
    sprint: createSprint({
      title: raw.workshopName || "Rapid Sprint",
      currentStage: STAGES.HOME,
      interviewQuestions: legacyQuestions,
    }),
    humanSessionId: uid("human"),
    humanDraft: { responses: {}, speakerName: "", submitted: false },
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadAuthState() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY)) || { facilitator: null };
  } catch (error) {
    return { facilitator: null };
  }
}

function saveAuthState() {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authState));
}

function isFacilitatorUnlocked() {
  return Boolean(authState.facilitator?.email);
}

function setState(mutator) {
  if (typeof mutator === "function") {
    mutator(state);
  } else {
    Object.assign(state, mutator);
  }
  saveState();
  render();
  if (!isApplyingRemoteSprint && state.role === ROLE.FACILITATOR) {
    queueSprintSave();
  }
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function makeInviteLink(sprintId, stage = STAGES.INTERVIEWS) {
  const url = new URL(getLiveBaseUrl());
  url.searchParams.set("sprint", sprintId);
  url.searchParams.set("role", ROLE.HUMAN);
  url.searchParams.set("stage", stage);
  if (API_BASE) url.searchParams.set("api", API_BASE);
  return url.toString();
}

function getLiveBaseUrl() {
  const localHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0", ""]);
  if (window.location.protocol.startsWith("http") && !localHosts.has(window.location.hostname)) {
    return `${window.location.origin}${window.location.pathname}`;
  }
  return FALLBACK_PAGES_URL;
}

function makeQrUrl(value) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(value)}`;
}

function isHumanInviteRoute() {
  return new URLSearchParams(window.location.search).get("role") === ROLE.HUMAN;
}

function getSprintIdFromUrl() {
  return new URLSearchParams(window.location.search).get("sprint");
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) {
    let message = `API ${response.status}`;
    try {
      const details = await response.json();
      message = details.details || details.error || message;
    } catch (error) {
      // Keep the status-only message when the response is not JSON.
    }
    throw new Error(message);
  }
  return response.json();
}

async function aiRequest(task, prompt) {
  const result = await apiRequest("/api/ai/generate", {
    method: "POST",
    body: JSON.stringify({ task, prompt }),
  });
  return result.json;
}

function queueSprintSave() {
  window.clearTimeout(sprintSaveTimerId);
  sprintSaveTimerId = window.setTimeout(saveSprintToApi, 250);
}

async function saveSprintToApi() {
  try {
    const result = await apiRequest(`/api/sprints/${encodeURIComponent(state.sprint.id)}`, {
      method: "PUT",
      body: JSON.stringify({ sprint: state.sprint }),
    });
    apiAvailable = true;
    applyRemoteSprint(result.sprint);
  } catch (error) {
    apiAvailable = false;
  }
}

async function fetchSprintFromApi() {
  const sprintId = getSprintIdFromUrl() || state.sprint.id;
  if (!sprintId) return;
  try {
    const result = await apiRequest(`/api/sprints/${encodeURIComponent(sprintId)}`);
    apiAvailable = true;
    applyRemoteSprint(result.sprint);
  } catch (error) {
    apiAvailable = false;
  }
}

function applyRemoteSprint(remoteSprint) {
  if (!remoteSprint?.id) return;
  if (remoteSprint.updatedAt && remoteSprint.updatedAt === state.sprint.updatedAt) return;
  const activeQuestionId = document.querySelector("#humanQuestionForm")?.dataset.questionId;
  const activeResponse = document.querySelector("#humanResponse")?.value;
  if (state.role === ROLE.HUMAN && activeQuestionId && activeResponse !== undefined) {
    state.humanDraft.responses[activeQuestionId] = activeResponse;
  }
  isApplyingRemoteSprint = true;
  state.sprint = createSprint({
    ...remoteSprint,
    inviteLink: makeInviteLink(remoteSprint.id, remoteSprint.currentStage || STAGES.INTERVIEWS),
  });
  saveState();
  render();
  isApplyingRemoteSprint = false;
}

function startSync() {
  window.clearInterval(syncTimerId);
  fetchSprintFromApi();
  syncTimerId = window.setInterval(fetchSprintFromApi, 2000);
}

async function submitInterviewToApi(responses) {
  try {
    const result = await apiRequest(`/api/sprints/${encodeURIComponent(state.sprint.id)}/interviews`, {
      method: "POST",
      body: JSON.stringify({
        humanId: state.humanSessionId,
        responses,
      }),
    });
    apiAvailable = true;
    applyRemoteSprint(result.sprint);
  } catch (error) {
    apiAvailable = false;
  }
}

async function submitVoteToApi(vote) {
  try {
    const result = await apiRequest(`/api/sprints/${encodeURIComponent(state.sprint.id)}/votes`, {
      method: "POST",
      body: JSON.stringify(vote),
    });
    apiAvailable = true;
    applyRemoteSprint(result.sprint);
  } catch (error) {
    apiAvailable = false;
  }
}

function appShell(content) {
  return `
    <div class="shell">
      <header class="topbar">
        <div class="brand"><span class="mark">RS</span><span>${escapeHtml(state.sprint.title)}</span></div>
        ${renderTopbarControls()}
      </header>
      <section class="workspace">${content}</section>
    </div>
  `;
}

function renderTopbarControls() {
  if (isHumanInviteRoute()) return "";
  return `<div class="topbar-actions">
    ${isFacilitatorUnlocked() ? `<span class="muted auth-email">${escapeHtml(authState.facilitator.email)}</span>` : ""}
    <div class="mode-switch" aria-label="Role">
      <button class="${state.role === ROLE.HUMAN ? "active" : ""}" data-role="${ROLE.HUMAN}">Human</button>
      <button class="${state.role === ROLE.FACILITATOR ? "active" : ""}" data-role="${ROLE.FACILITATOR}">Facilitator</button>
    </div>
    ${isFacilitatorUnlocked() ? `<button type="button" class="secondary small-button" id="signOutFacilitator">Sign Out</button>` : ""}
  </div>`;
}

function render() {
  const app = document.querySelector("#app");
  const content = state.role === ROLE.FACILITATOR && !isFacilitatorUnlocked()
    ? renderFacilitatorLogin()
    : state.role === ROLE.FACILITATOR ? renderFacilitator() : renderHuman();
  app.innerHTML = appShell(content);
  bindCommon();
  if (state.role === ROLE.FACILITATOR && !isFacilitatorUnlocked()) {
    bindFacilitatorLogin();
  } else {
    state.role === ROLE.FACILITATOR ? bindFacilitator() : bindHuman();
  }
}

function renderFacilitatorLogin() {
  return `
    <form class="panel panel-pad grid login-panel" id="facilitatorLoginForm">
      <div>
        <p class="eyebrow">Facilitator Access</p>
        <h1>Sign in to start.</h1>
        <p class="lead">Use the email and password provided for this test group.</p>
      </div>
      <div class="field">
        <label for="facilitatorEmail">Email</label>
        <input id="facilitatorEmail" name="email" type="email" autocomplete="email" required>
      </div>
      <div class="field">
        <label for="facilitatorPassword">Password</label>
        <input id="facilitatorPassword" name="password" type="password" autocomplete="current-password" required>
      </div>
      <p class="danger-text" id="loginError" hidden></p>
      <button type="submit">Sign In</button>
    </form>
  `;
}

function bindFacilitatorLogin() {
  document.querySelector("#facilitatorLoginForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const email = event.target.elements.email.value.trim().toLowerCase();
    const password = event.target.elements.password.value.trim();
    if (!FACILITATOR_PASSWORDS.includes(password)) {
      const error = document.querySelector("#loginError");
      if (error) {
        error.hidden = false;
        error.textContent = "Invalid email or password.";
      }
      return;
    }
    authState.facilitator = { email, signedInAt: new Date().toISOString() };
    saveAuthState();
    render();
  });
}

function renderFacilitator() {
  const screen = {
    [STAGES.HOME]: renderFacilitatorHome,
    [STAGES.CREATE]: renderCreateSprint,
    [STAGES.REVIEW_QUESTIONS]: renderReviewQuestions,
    [STAGES.INTERVIEWS]: renderLiveDashboard,
    [STAGES.IDEAS]: renderFacilitatorIdeas,
    [STAGES.VOTING]: renderVotingLive,
    [STAGES.PROTOTYPE]: renderPrototypeExport,
  }[state.sprint.currentStage] || renderFacilitatorHome;

  return `
    ${renderStageStrip()}
    ${isActiveFacilitatorScreen() ? `<div class="facilitator-layout"><div>${screen()}</div>${renderInvitePanel()}</div>` : screen()}
  `;
}

function renderStageStrip() {
  return `<div class="status-strip">${facilitatorFlow.map(([stage, label]) => `
    <button type="button" class="phase ${state.sprint.currentStage === stage ? "active" : ""}" data-stage="${stage}">${escapeHtml(label)}</button>
  `).join("")}</div>`;
}

function isActiveFacilitatorScreen() {
  return [STAGES.INTERVIEWS, STAGES.VOTING, STAGES.PROTOTYPE].includes(state.sprint.currentStage);
}

function renderInvitePanel() {
  const link = makeInviteLink(state.sprint.id, state.sprint.currentStage);
  return `
    <aside class="panel panel-pad invite-panel">
      <p class="eyebrow">${escapeHtml(getInviteStageLabel())}</p>
      <h2>${escapeHtml(getInviteHeading())}</h2>
      <p class="muted">Copy and paste this link into your chat or email.</p>
      <img class="qr-code" src="${escapeAttr(makeQrUrl(link))}" alt="QR code for ${escapeAttr(getInviteHeading())}">
      <div class="field">
        <label for="inviteLink">Join link</label>
        <input id="inviteLink" value="${escapeAttr(link)}" readonly>
      </div>
      <button type="button" id="copyInviteLink">Copy Link</button>
    </aside>
  `;
}

function getInviteHeading() {
  if (state.sprint.currentStage === STAGES.VOTING) return "Join Voting";
  if (state.sprint.currentStage === STAGES.PROTOTYPE) return "Join Prototype";
  return "Join Research Interview";
}

function getInviteStageLabel() {
  if (state.sprint.currentStage === STAGES.VOTING) return "Join Now: Idea Voting";
  if (state.sprint.currentStage === STAGES.PROTOTYPE) return "Join Now: Prototype";
  return "Join Now: Empathy Interviews";
}

function renderFacilitatorHome() {
  return `
    <div class="hero">
      <section>
        <h1>Facilitator manages the process.</h1>
        <p class="lead">Humans contribute intelligence. AI accelerates in between.</p>
      </section>
      <section class="panel panel-pad grid">
        <h2>Home</h2>
        <p class="muted">Start a new Rapid Sprint or continue the current one.</p>
        <button type="button" data-stage="${STAGES.CREATE}">Create Sprint</button>
      </section>
    </div>
  `;
}

function renderCreateSprint() {
  return `
    <form class="panel panel-pad grid narrow" id="createSprintForm">
      <h1>Create Sprint</h1>
      <div class="field">
        <label for="sprintTitle">Title</label>
        <input id="sprintTitle" name="title" required value="${escapeAttr(state.sprint.title)}">
      </div>
      <div class="field">
        <label for="challenge">Description of Need/Pain Point/Challenge</label>
        <textarea id="challenge" name="challenge" required placeholder="Description or focus question entered by the facilitator.">${escapeHtml(state.sprint.challenge)}</textarea>
      </div>
      <button type="submit">[AI] Generate Interview Questions</button>
    </form>
  `;
}

function renderReviewQuestions() {
  const questions = getInterviewQuestions();
  return `
    <form class="panel panel-pad grid" id="reviewQuestionsForm">
      <h1>Review & Edit Interview Questions</h1>
      <p class="lead">Edit the three AI-generated questions before sending them to Humans.</p>
      ${questions.map((question, index) => `
        <div class="field question-edit">
          <label for="question-${index}">Question ${index + 1}: ${escapeHtml(question.title)}</label>
          <input id="question-${index}" name="question${index}" value="${escapeAttr(question.question)}" required>
        </div>
      `).join("")}
      <div class="row">
        <button type="button" class="secondary" id="regenerateQuestions">[AI] Regenerate Questions</button>
        <button type="submit">Confirm & Continue</button>
      </div>
    </form>
  `;
}

function renderLiveDashboard() {
  const counts = getCounts();
  return `
    <section class="grid">
      <div>
        <h1>Interview Stage</h1>
        <p class="lead">Humans answer one interview question at a time. Their submitted interviews appear here.</p>
        <button type="button" id="goIdeas">[AI] Analyze and Generate Ideas</button>
      </div>
      <div class="grid three">
        <div class="stat"><span class="muted">Humans submitted</span><strong>${counts.submitted}</strong></div>
        <div class="stat"><span class="muted">Responses</span><strong>${counts.responses}</strong></div>
        <div class="stat"><span class="muted">Votes</span><strong>${counts.votes}</strong></div>
      </div>
      <section class="panel panel-pad grid">
        <h2>Interview Responses</h2>
        ${state.sprint.interviewResponses.length ? state.sprint.interviewResponses.map(renderInterviewResponse).join("") : `<p class="muted">No Human interviews submitted yet.</p>`}
      </section>
    </section>
  `;
}

function renderInterviewResponse(response) {
  return `
    <article class="submission">
      <div class="row split">
        <strong>${escapeHtml(response.speakerName || "Unnamed speaker")}</strong>
        <span class="muted">${escapeHtml(formatDate(response.submittedAt))}</span>
      </div>
      <h3>${escapeHtml(response.questionTitle)}</h3>
      <p class="muted">${escapeHtml(response.questionText)}</p>
      <p>${escapeHtml(response.responseText || response.transcript || "")}</p>
    </article>
  `;
}

function renderFacilitatorIdeas() {
  const ideas = getAllIdeas();
  return `
    <section class="grid">
      <div>
        <h1>Generated Ideas</h1>
        <p class="lead">Review the generated ideas, then add Facilitator ideas before voting.</p>
      </div>
      <div class="row">
        <button type="button" class="secondary" id="generateIdeas">[AI] ${state.sprint.generatedIdeas.length ? "Regenerate" : "Generate"} Ideas</button>
        <button type="button" id="nextVoting" ${ideas.length ? "" : "disabled"}>Next: Voting</button>
      </div>
      <section class="panel panel-pad grid">
        <h2>Idea Set</h2>
        ${state.sprint.generatedIdeas.length ? `<h3>10 AI-generated ideas</h3><div class="grid">${state.sprint.generatedIdeas.map((idea) => renderIdea(idea, true)).join("")}</div>` : `<p class="muted">No AI-generated ideas yet.</p>`}
        <form class="row add-idea-form" id="facilitatorIdeaForm">
          <input id="facilitatorIdeaTitle" required placeholder="Type your idea here...">
          <button type="submit">Add Idea</button>
        </form>
        ${state.sprint.facilitatorAddedIdeas.length ? `<h3>Facilitator ideas</h3><div class="grid">${state.sprint.facilitatorAddedIdeas.map((idea) => renderIdea(idea, true)).join("")}</div>` : ""}
      </section>
    </section>
  `;
}

function renderVotingLive() {
  const results = calculateResults();
  return `
    <section class="grid">
      <div>
        <h1>Voting Live</h1>
        <p class="lead">Humans vote on the current idea set. Results update as votes arrive.</p>
      </div>
      <section class="panel panel-pad grid">
        <h2>Live Results</h2>
        ${results.length ? results.map(renderResultRow).join("") : `<p class="muted">No votes submitted yet.</p>`}
      </section>
      <div class="row">
        <button type="button" id="selectTopIdea" ${results.length ? "" : "disabled"}>Select Top Idea</button>
        <button type="button" id="goPrototype">Prototype & Export</button>
      </div>
    </section>
  `;
}

function renderResultRow(idea) {
  return `
    <div class="ballot-row row split">
      <div>
        <strong>${escapeHtml(idea.title)}</strong>
        <p class="muted">${escapeHtml(idea.description || "")}</p>
      </div>
      <span class="score">${idea.voteCount}</span>
    </div>
  `;
}

function renderPrototypeExport() {
  const selected = getSelectedIdea();
  return `
    <section class="grid">
      <div>
        <h1>Prototype & Export</h1>
        <p class="lead">Carry the selected idea into prototyping and export the sprint record.</p>
      </div>
      <section class="panel panel-pad grid">
        <h2>Selected Idea</h2>
        ${selected ? renderIdea(selected) : `<p class="muted">No selected idea yet. Select one from Voting Live or continue with the highest vote count.</p>`}
        <button type="button" id="exportData">Export JSON</button>
      </section>
    </section>
  `;
}

function renderHuman() {
  return `
    <div class="mobile-flow-note">${humanFlow.map((label, index) => `<span class="${getHumanStepIndex() === index ? "active" : ""}">${escapeHtml(label)}</span>`).join("")}</div>
    ${renderHumanScreen()}
  `;
}

function renderHumanScreen() {
  const stage = state.sprint.currentStage;
  if ([STAGES.HOME, STAGES.CREATE, STAGES.REVIEW_QUESTIONS].includes(stage)) return renderWaitingRoom();
  if (stage === STAGES.INTERVIEWS) return renderHumanInterviewFlow();
  if (stage === STAGES.IDEAS) return renderAfterSubmitWaiting();
  if (stage === STAGES.VOTING) return renderHumanVoting();
  if (stage === STAGES.PROTOTYPE) return renderHumanDone();
  return renderWaitingRoom();
}

function renderWaitingRoom() {
  return `
    <section class="panel panel-pad grid mobile-card">
      <h1>Waiting Room</h1>
      <p class="lead">The Facilitator will start the next activity soon.</p>
      <p class="muted">${escapeHtml(state.sprint.title)}</p>
    </section>
  `;
}

function renderHumanInterviewFlow() {
  const questions = getInterviewQuestions();
  const nextIndex = questions.findIndex((question) => !state.humanDraft.responses[question.id]);
  if (nextIndex === -1) return state.humanDraft.submitted ? renderAfterSubmitWaiting() : renderSubmitInterview();
  const question = questions[nextIndex];
  return `
    <form class="panel panel-pad grid mobile-card" id="humanQuestionForm" data-question-id="${escapeAttr(question.id)}">
      <p class="eyebrow">Question ${nextIndex + 1}: ${escapeHtml(question.title)}</p>
      <h1>${escapeHtml(question.question)}</h1>
      <div class="row">
        <button type="button" id="recordBtn">record</button>
        <button type="button" class="secondary" id="stopRecordBtn" disabled>Stop</button>
        <span id="recordingStatus" class="muted">Ready</span>
      </div>
      <div class="field">
        <label for="humanResponse">Your response</label>
        <textarea id="humanResponse" required placeholder="Share a story, example, or observation.">${escapeHtml(state.humanDraft.responses[question.id] || "")}</textarea>
      </div>
      <button type="submit">Next</button>
    </form>
  `;
}

function renderSubmitInterview() {
  return `
    <form class="panel panel-pad grid mobile-card" id="submitInterviewForm">
      <h1>Submit Interview</h1>
      <p class="lead">Your interview responses have been recorded. Add the speaker name, then submit them to the Facilitator.</p>
      <div class="field">
        <label for="speakerName">Name of Speaker</label>
        <input id="speakerName" required value="${escapeAttr(state.humanDraft.speakerName)}" placeholder="Alex Morgan">
      </div>
      <button type="submit">Submit Interview</button>
    </form>
  `;
}

function renderAfterSubmitWaiting() {
  return `
    <section class="panel panel-pad grid mobile-card">
      <h1>After Submit / Waiting</h1>
      <p class="lead">Interview submitted. The Facilitator is reviewing ideas before voting opens.</p>
    </section>
  `;
}

function renderHumanVoting() {
  const ideas = getAllIdeas();
  const existingVote = state.sprint.votes.find((vote) => vote.humanId === state.humanSessionId);
  return `
    <form class="panel panel-pad grid mobile-card" id="humanVoteForm">
      <h1>Idea Voting</h1>
      <p class="lead">Prioritize your top 3 ideas in order.</p>
      ${ideas.length ? `
        <div class="rank-grid">
          ${[1, 2, 3].map((rank) => `
            <div class="rank-slot">
              <span>${rank}</span>
              <select name="rank${rank}" required>
                <option value="">Select idea</option>
                ${ideas.map((idea) => `<option value="${escapeAttr(idea.id)}" ${existingVote?.ranked?.[rank - 1] === idea.id ? "selected" : ""}>${escapeHtml(idea.title)}</option>`).join("")}
              </select>
            </div>
          `).join("")}
        </div>
        <div class="grid">${ideas.map((idea) => renderIdea(idea)).join("")}</div>
      ` : `<p class="muted">The Facilitator has not opened an idea set yet.</p>`}
      <button type="submit" ${ideas.length ? "" : "disabled"}>${existingVote ? "Update Vote" : "Submit Vote"}</button>
    </form>
  `;
}

function renderHumanDone() {
  const selected = getSelectedIdea() || calculateResults()[0];
  return `
    <section class="panel panel-pad grid mobile-card">
      <h1>Prototype & Done</h1>
      ${selected ? renderIdea(selected) : `<p class="lead">The Facilitator is preparing the prototype direction.</p>`}
    </section>
  `;
}

function renderIdea(idea, withControls = false) {
  return `
    <article class="idea">
      <div class="row split">
        <div class="idea-title">${escapeHtml(idea.title)}</div>
        ${withControls ? `<button type="button" class="danger" data-delete-idea="${escapeAttr(idea.id)}">Remove</button>` : ""}
      </div>
      <p class="muted">${escapeHtml(idea.description || "")}</p>
      <small class="muted">${idea.confidence ? `Confidence: ${escapeHtml(idea.confidence)} | ` : ""}Votes: ${idea.voteCount || 0}</small>
    </article>
  `;
}

function bindCommon() {
  document.querySelectorAll("[data-role]").forEach((button) => {
    button.addEventListener("click", () => setState({ role: button.dataset.role }));
  });
  document.querySelector("#signOutFacilitator")?.addEventListener("click", () => {
    authState.facilitator = null;
    saveAuthState();
    render();
  });
}

function bindFacilitator() {
  document.querySelectorAll("[data-stage]").forEach((button) => {
    button.addEventListener("click", () => setStage(button.dataset.stage));
  });

  document.querySelector("#createSprintForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    const submitButton = form.querySelector("button[type='submit']");
    const title = form.elements.title.value.trim() || "Rapid Sprint";
    const challenge = form.elements.challenge.value.trim();
    setButtonLoading(submitButton, "[AI] Generating...");
    try {
      const interviewQuestions = await generateInterviewQuestionsWithAi(challenge);
      const nextSprint = createSprint({
        title,
        challenge,
        currentStage: STAGES.REVIEW_QUESTIONS,
        interviewQuestions,
      });
      setState((draft) => {
        draft.sprint = nextSprint;
        draft.humanDraft = { responses: {}, speakerName: "", submitted: false };
      });
    } catch (error) {
      showAiError(error);
    } finally {
      restoreButton(submitButton);
    }
  });

  document.querySelector("#regenerateQuestions")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    setButtonLoading(button, "[AI] Regenerating...");
    try {
      const interviewQuestions = await generateInterviewQuestionsWithAi(state.sprint.challenge);
      setState((draft) => {
        draft.sprint.interviewQuestions = interviewQuestions;
      });
    } catch (error) {
      showAiError(error);
    } finally {
      restoreButton(button);
    }
  });

  document.querySelector("#reviewQuestionsForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    setState((draft) => {
      draft.sprint.interviewQuestions = getInterviewQuestions().map((question, index) => ({
        ...question,
        question: event.target.elements[`question${index}`].value.trim(),
      }));
      draft.sprint.currentStage = STAGES.INTERVIEWS;
    });
  });

  document.querySelector("#copyInviteLink")?.addEventListener("click", async () => {
    const link = document.querySelector("#inviteLink")?.value || makeInviteLink(state.sprint.id, state.sprint.currentStage);
    await navigator.clipboard?.writeText(link);
    const button = document.querySelector("#copyInviteLink");
    if (button) button.textContent = "Copied";
  });

  document.querySelector("#goIdeas")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    setButtonLoading(button, "[AI] Analyzing...");
    try {
      const generatedIdeas = state.sprint.generatedIdeas.length
        ? state.sprint.generatedIdeas
        : await generateIdeasWithAi(state.sprint);
      setState((draft) => {
        draft.sprint.generatedIdeas = generatedIdeas;
        draft.sprint.currentStage = STAGES.IDEAS;
      });
    } catch (error) {
      showAiError(error);
    } finally {
      restoreButton(button);
    }
  });

  document.querySelector("#generateIdeas")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    setButtonLoading(button, "[AI] Generating...");
    try {
      const generatedIdeas = await generateIdeasWithAi(state.sprint);
      setState((draft) => {
        draft.sprint.generatedIdeas = generatedIdeas;
      });
    } catch (error) {
      showAiError(error);
    } finally {
      restoreButton(button);
    }
  });

  document.querySelector("#facilitatorIdeaForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const title = event.target.elements.facilitatorIdeaTitle.value.trim();
    if (!title) return;
    setState((draft) => {
      draft.sprint.facilitatorAddedIdeas.push({
        id: uid("idea"),
        title,
        description: "",
        source: "facilitator",
        voteCount: 0,
      });
    });
  });

  document.querySelectorAll("[data-delete-idea]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.deleteIdea;
      setState((draft) => {
        draft.sprint.generatedIdeas = draft.sprint.generatedIdeas.filter((idea) => idea.id !== id);
        draft.sprint.facilitatorAddedIdeas = draft.sprint.facilitatorAddedIdeas.filter((idea) => idea.id !== id);
        draft.sprint.votes = draft.sprint.votes
          .map((vote) => vote.ranked ? { ...vote, ranked: vote.ranked.filter((ideaId) => ideaId !== id) } : vote)
          .filter((vote) => vote.ideaId !== id && (!vote.ranked || vote.ranked.length));
      });
    });
  });

  document.querySelector("#nextVoting")?.addEventListener("click", () => setStage(STAGES.VOTING));

  document.querySelector("#selectTopIdea")?.addEventListener("click", () => {
    const topIdea = calculateResults()[0];
    if (!topIdea) return;
    setState((draft) => {
      draft.sprint.selectedIdea = topIdea.id;
    });
  });

  document.querySelector("#goPrototype")?.addEventListener("click", () => setStage(STAGES.PROTOTYPE));

  document.querySelector("#exportData")?.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ sprint: state.sprint, promptLibrary }, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "rapid-sprint-export.json";
    link.click();
    URL.revokeObjectURL(link.href);
  });
}

function bindHuman() {
  document.querySelector("#humanQuestionForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const questionId = event.target.dataset.questionId;
    const response = event.target.elements.humanResponse.value.trim();
    if (!response) return;
    setState((draft) => {
      draft.humanDraft.responses[questionId] = response;
    });
  });

  document.querySelector("#recordBtn")?.addEventListener("click", startRecording);
  document.querySelector("#stopRecordBtn")?.addEventListener("click", stopRecording);

  document.querySelector("#submitInterviewForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const speakerName = event.target.elements.speakerName.value.trim();
    if (!speakerName) return;
    let submittedResponses = [];
    setState((draft) => {
      draft.humanDraft.speakerName = speakerName;
      draft.humanDraft.submitted = true;
      const questions = getInterviewQuestions();
      const submittedAt = new Date().toISOString();
      draft.sprint.interviewResponses = draft.sprint.interviewResponses.filter((response) => response.humanId !== draft.humanSessionId);
      submittedResponses = questions.map((question) => ({
          id: uid("response"),
          humanId: draft.humanSessionId,
          questionId: question.id,
          questionTitle: question.title,
          questionText: question.question,
          responseText: draft.humanDraft.responses[question.id] || "",
          transcript: draft.humanDraft.responses[question.id] || "",
          speakerName,
          submittedAt,
      }));
      draft.sprint.interviewResponses.push(...submittedResponses);
    });
    submitInterviewToApi(submittedResponses);
  });

  document.querySelector("#humanVoteForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const ranked = [
      event.target.elements.rank1.value,
      event.target.elements.rank2.value,
      event.target.elements.rank3.value,
    ];
    if (new Set(ranked).size !== ranked.length) {
      alert("Please choose three different ideas.");
      return;
    }
    const vote = {
      id: uid("vote"),
      humanId: state.humanSessionId,
      ranked,
      submittedAt: new Date().toISOString(),
    };
    setState((draft) => {
      draft.sprint.votes = draft.sprint.votes.filter((vote) => vote.humanId !== draft.humanSessionId);
      draft.sprint.votes.push(vote);
    });
    submitVoteToApi(vote);
  });
}

function startRecording() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const textarea = document.querySelector("#humanResponse");
  const status = document.querySelector("#recordingStatus");
  const recordButton = document.querySelector("#recordBtn");
  const stopButton = document.querySelector("#stopRecordBtn");
  const questionId = document.querySelector("#humanQuestionForm")?.dataset.questionId || "";

  if (!SpeechRecognition || !textarea) {
    if (status) status.textContent = "Live transcription is not available. You can still paste text.";
    return;
  }

  stopRecording();
  currentRecordingQuestionId = questionId;
  isTranscribing = true;
  speechRecognition = new SpeechRecognition();
  speechRecognition.continuous = true;
  speechRecognition.interimResults = true;
  speechRecognition.lang = navigator.language || "en-US";

  const startingText = textarea.value.trim();
  let finalText = "";

  speechRecognition.onresult = (event) => {
    let interimText = "";
    finalText = "";
    for (let index = 0; index < event.results.length; index += 1) {
      const text = event.results[index][0]?.transcript || "";
      if (event.results[index].isFinal) {
        finalText += `${text} `;
      } else {
        interimText += text;
      }
    }
    textarea.value = [startingText, finalText.trim(), interimText.trim()].filter(Boolean).join(" ");
    if (currentRecordingQuestionId) {
      state.humanDraft.responses[currentRecordingQuestionId] = textarea.value.trim();
      saveState();
    }
  };

  speechRecognition.onerror = (event) => {
    if (status) status.textContent = `Recording stopped: ${event.error}. You can still paste text.`;
    stopRecording();
  };

  speechRecognition.onend = () => {
    if (isTranscribing) {
      try {
        speechRecognition.start();
      } catch (error) {
        if (status) status.textContent = "Recording paused. Click Record to continue.";
      }
    }
  };

  try {
    speechRecognition.start();
    if (recordButton) recordButton.disabled = true;
    if (stopButton) stopButton.disabled = false;
    if (status) {
      status.className = "recording";
      status.textContent = "Recording...";
    }
  } catch (error) {
    isTranscribing = false;
    if (status) status.textContent = "Recording could not start. Check microphone permission.";
  }
}

function stopRecording() {
  isTranscribing = false;
  const recordButton = document.querySelector("#recordBtn");
  const stopButton = document.querySelector("#stopRecordBtn");
  const status = document.querySelector("#recordingStatus");

  if (speechRecognition) {
    speechRecognition.onend = null;
    try {
      speechRecognition.stop();
    } catch (error) {
      console.warn("Speech recognition stop skipped.", error);
    }
  }
  speechRecognition = null;
  if (recordButton) recordButton.disabled = false;
  if (stopButton) stopButton.disabled = true;
  if (status && status.textContent === "Recording...") {
    status.className = "muted";
    status.textContent = "Recording stopped. Review or edit the text.";
  }
}

function setStage(stage) {
  setState((draft) => {
    draft.sprint.currentStage = stage;
  });
}

function getInterviewQuestions() {
  if (state.sprint.interviewQuestions.length) return state.sprint.interviewQuestions;
  return generateInterviewQuestions(state.sprint.challenge || "Improve the current experience");
}

function generateInterviewQuestions(challenge) {
  const focus = summarizeChallenge(challenge);
  return [
    {
      id: "q1",
      type: "bright_spots",
      title: "Bright Spots",
      question: `Tell me about a recent time ${focus} worked better than expected.`,
    },
    {
      id: "q2",
      type: "pain_points",
      title: "Pain Points",
      question: `Tell me about a recent time someone got stuck, slowed down, or frustrated with ${focus}.`,
    },
    {
      id: "q3",
      type: "future_improvements",
      title: "Improvements",
      question: `What would have made that moment with ${focus} easier, clearer, or more useful?`,
    },
  ];
}

async function generateInterviewQuestionsWithAi(challenge) {
  const prompt = renderPrompt(promptLibrary.generateInterviewQuestions.template, {
    challenge,
  });
  const result = await aiRequest(promptLibrary.generateInterviewQuestions.id, prompt);
  const questions = normalizeInterviewQuestions(result.questions, challenge);
  if (!isSpecificQuestionSet(questions, challenge)) {
    throw new Error("Gemini returned generic interview questions. Try adding more concrete detail to the challenge.");
  }
  return questions;
}

function normalizeInterviewQuestions(questions, challenge) {
  if (!Array.isArray(questions) || questions.length < 3) {
    throw new Error("The remote AI provider did not return three questions.");
  }
  const fallback = generateInterviewQuestions(challenge);
  return questions.slice(0, 3).map((question, index) => ({
    id: fallback[index].id,
    type: question.type || fallback[index].type,
    title: question.title || fallback[index].title,
    question: requireAiText(question.question, `question ${index + 1}`),
  }));
}

function requireAiText(value, label) {
  const text = String(value || "").trim();
  if (!text) {
    throw new Error(`Gemini returned an empty ${label}.`);
  }
  return text;
}

function isSpecificQuestionSet(questions, challenge) {
  if (!Array.isArray(questions) || questions.length !== 3) return false;
  const combined = questions.map((question) => question.question).join(" ").toLowerCase();
  const challengeTerms = getChallengeTerms(challenge);
  const hasChallengeLanguage = !challengeTerms.length || challengeTerms.some((term) => combined.includes(term));
  const allAskForStories = questions.every((question) => /\b(recent|time|moment|example|story|situation|when)\b/i.test(question.question));
  const avoidsEmptyPlaceholders = !/\b(this experience|your experience|the experience|things|stuff)\b/i.test(combined);
  return hasChallengeLanguage && allAskForStories && avoidsEmptyPlaceholders;
}

function getChallengeTerms(challenge) {
  const stopWords = new Set([
    "about", "after", "again", "being", "better", "could", "create", "design", "does", "easier",
    "from", "have", "help", "improve", "into", "make", "more", "need", "needs", "pain", "point",
    "points", "should", "that", "their", "there", "these", "they", "this", "through", "user",
    "users", "want", "what", "when", "where", "with", "would",
  ]);
  return String(challenge || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !stopWords.has(word))
    .slice(0, 12);
}

function summarizeChallenge(challenge) {
  let cleaned = String(challenge || "")
    .toLowerCase()
    .replace(/[?.!]+$/g, "")
    .replace(/^(how might we|how can we|help us|we need to|we want to|improve|make|create|design|build)\s+/i, "")
    .replace(/\b(users|people|customers|humans)\b/g, "people")
    .replace(/\s+/g, " ")
    .trim();

  const contextMatch = cleaned.match(/\b(?:for|with|during|when)\s+(.+)$/);
  if (contextMatch?.[1]) {
    cleaned = contextMatch[1].trim();
  }

  cleaned = cleaned
    .replace(/^(reduce friction|solve pain points|address pain points|make it easier|make easier|support|help|improve)\s+(for\s+)?/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "this experience";
  const words = cleaned.split(/\s+/).filter(Boolean);
  const summary = words.slice(0, 10).join(" ");
  return summary || "this experience";
}

function generateIdeas(sprint) {
  const responseText = sprint.interviewResponses.map((response) => response.responseText || response.transcript || "").join(" ").toLowerCase();
  const evidenceCount = sprint.interviewResponses.length;
  const keywordBoosts = [
    ["wait", "waiting", "slow", "delay"],
    ["confusing", "unclear", "lost", "hard"],
    ["repeat", "again", "duplicate"],
    ["share", "handoff", "team"],
    ["track", "status", "progress"],
  ];

  return ideaSeeds.map(([title, description], index) => {
    const boost = keywordBoosts[index % keywordBoosts.length].some((word) => responseText.includes(word));
    return {
      id: `ai-${index + 1}`,
      title,
      description,
      source: "ai",
      confidence: boost && evidenceCount > 3 ? "High" : evidenceCount ? "Medium" : "Low",
      voteCount: 0,
    };
  });
}

async function generateIdeasWithAi(sprint) {
  const prompt = renderPrompt(promptLibrary.generateIdeas.template, {
    challenge: sprint.challenge || "Improve the current experience",
    interview_questions: JSON.stringify(getInterviewQuestions(), null, 2),
    responses: JSON.stringify(sprint.interviewResponses, null, 2),
  });
  const result = await aiRequest(promptLibrary.generateIdeas.id, prompt);
  return normalizeIdeas(result.ideas, sprint);
}

function normalizeIdeas(ideas, sprint) {
  if (!Array.isArray(ideas) || ideas.length < 5) {
    throw new Error("The remote AI provider did not return enough ideas.");
  }
  return ideas.slice(0, 10).map((idea, index) => ({
    id: `ai-${index + 1}`,
    title: requireAiText(idea.title, `title for idea ${index + 1}`),
    description: requireAiText(idea.description, `description for idea ${index + 1}`),
    source: "ai",
    confidence: ["High", "Medium", "Low"].includes(idea.confidence) ? idea.confidence : "Medium",
    voteCount: 0,
  }));
}

function renderPrompt(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => values[key] ?? "");
}

function showAiError(error) {
  const message = error?.message || "AI generation failed.";
  window.alert([
    "Gemini did not generate output.",
    "",
    message,
    "",
    "Try again. If this keeps happening, check that the API service is running and GEMINI_API_KEY is configured.",
  ].join("\n"));
}

function setButtonLoading(button, label) {
  if (!button) return;
  button.dataset.originalText = button.textContent;
  button.textContent = label;
  button.disabled = true;
}

function restoreButton(button) {
  if (!button) return;
  button.textContent = button.dataset.originalText || button.textContent;
  button.disabled = false;
  delete button.dataset.originalText;
}

function getAllIdeas() {
  const counts = voteCounts();
  return [...state.sprint.generatedIdeas, ...state.sprint.facilitatorAddedIdeas].map((idea) => ({
    ...idea,
    voteCount: counts.get(idea.id) || 0,
  }));
}

function voteCounts() {
  const counts = new Map();
  state.sprint.votes.forEach((vote) => {
    if (vote.ranked?.length) {
      vote.ranked.forEach((ideaId, index) => {
        counts.set(ideaId, (counts.get(ideaId) || 0) + 3 - index);
      });
      return;
    }
    if (vote.ideaId) {
      counts.set(vote.ideaId, (counts.get(vote.ideaId) || 0) + 1);
    }
  });
  return counts;
}

function calculateResults() {
  return getAllIdeas().filter((idea) => idea.voteCount > 0).sort((a, b) => b.voteCount - a.voteCount);
}

function getSelectedIdea() {
  if (!state.sprint.selectedIdea) return null;
  return getAllIdeas().find((idea) => idea.id === state.sprint.selectedIdea) || null;
}

function getCounts() {
  const humanIds = new Set(state.sprint.interviewResponses.map((response) => response.humanId));
  return {
    submitted: humanIds.size,
    responses: state.sprint.interviewResponses.length,
    votes: state.sprint.votes.length,
  };
}

function getHumanStepIndex() {
  const stage = state.sprint.currentStage;
  if ([STAGES.HOME, STAGES.CREATE, STAGES.REVIEW_QUESTIONS].includes(stage)) return 0;
  if (stage === STAGES.INTERVIEWS) {
    if (state.humanDraft.submitted) return 5;
    const questions = getInterviewQuestions();
    const nextIndex = questions.findIndex((question) => !state.humanDraft.responses[question.id]);
    return nextIndex === -1 ? 4 : nextIndex + 1;
  }
  if (stage === STAGES.IDEAS) return 5;
  if (stage === STAGES.VOTING) return 6;
  if (stage === STAGES.PROTOTYPE) return 7;
  return 0;
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

window.addEventListener("storage", () => {
  Object.assign(state, loadState());
  render();
});

const queryRole = new URLSearchParams(window.location.search).get("role");
const querySprint = getSprintIdFromUrl();
if (querySprint) {
  state.sprint.id = querySprint;
  state.sprint.inviteLink = makeInviteLink(querySprint, state.sprint.currentStage || STAGES.INTERVIEWS);
}
if (queryRole === ROLE.HUMAN && state.role !== ROLE.HUMAN) {
  state.role = ROLE.HUMAN;
}
const queryStage = new URLSearchParams(window.location.search).get("stage");
if (queryRole === ROLE.HUMAN && Object.values(STAGES).includes(queryStage)) {
  state.sprint.currentStage = queryStage;
}
if (queryRole === ROLE.HUMAN) saveState();

startSync();
render();
