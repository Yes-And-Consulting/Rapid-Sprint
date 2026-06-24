const STORAGE_KEY = "rapidSprint.v1";

const phases = [
  ["collect", "Collect transcripts"],
  ["analyze", "Generate ideas"],
  ["others", "Collect other ideas"],
  ["rank", "Rank top 3"],
  ["results", "Reveal result"],
];

const defaultQuestions = [
  "What was the hardest part of the current experience?",
  "Where did the interviewee hesitate, work around, or express frustration?",
  "What would make the experience meaningfully better?",
];

const seedIdeas = [
  {
    title: "Simplify the first step",
    description: "Reduce the amount of setup needed before someone can start the core task.",
  },
  {
    title: "Create guided decision points",
    description: "Add lightweight prompts at confusing moments so people know what to do next.",
  },
  {
    title: "Make progress visible",
    description: "Show what has been completed, what is happening now, and what remains.",
  },
];

const state = loadState();
let mediaRecorder = null;
let audioChunks = [];
let recordingStartedAt = null;
let timerId = null;
let speechRecognition = null;
let liveTranscript = "";
let transcriptBeforeRecording = "";
let accumulatedSpeechTranscript = "";
let currentSpeechTranscript = "";

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    return JSON.parse(saved);
  }

  return {
    mode: "participant",
    phase: "collect",
    workshopName: "Rapid AI Design Sprint",
    questions: defaultQuestions.join("\n"),
    participants: [],
    ideas: [],
    votes: [],
    currentParticipantId: "",
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function setState(patch) {
  Object.assign(state, patch);
  saveState();
  render();
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function appShell(content) {
  return `
    <div class="shell">
      <header class="topbar">
        <div class="brand"><span class="mark">RS</span><span>${escapeHtml(state.workshopName)}</span></div>
        <div class="mode-switch" aria-label="Mode">
          <button class="${state.mode === "participant" ? "active" : ""}" data-mode="participant">Designer</button>
          <button class="${state.mode === "pm" ? "active" : ""}" data-mode="pm">Facilitator</button>
        </div>
      </header>
      <section class="workspace">${content}</section>
    </div>
  `;
}

function render() {
  const app = document.querySelector("#app");
  app.innerHTML = appShell(state.mode === "pm" ? renderPm() : renderParticipant());
  bindCommon();
  state.mode === "pm" ? bindPm() : bindParticipant();
}

function renderParticipant() {
  if (state.phase === "results") {
    return renderParticipantResults();
  }

  const participant = getCurrentParticipant();
  if (!participant) {
    return `
      <div class="hero">
        <div>
          <h1>Join the sprint from your phone.</h1>
          <p class="lead">Designers enter their name to submit interview notes, suggest missing ideas, and rank their top three when the facilitator opens voting.</p>
        </div>
        <form class="panel panel-pad grid" id="joinForm">
          <div class="field">
            <label for="participantName">Your name</label>
            <input id="participantName" name="participantName" autocomplete="name" required placeholder="Alex Morgan">
          </div>
          <button type="submit">Join workshop</button>
        </form>
      </div>
    `;
  }

  if (state.phase === "collect" || state.phase === "analyze") {
    return renderTranscriptScreen(participant);
  }

  if (state.phase === "others") {
    return renderOtherIdeasScreen(participant);
  }

  if (state.phase === "rank") {
    return renderRankingScreen(participant);
  }

  return `<div class="panel panel-pad"><h2>Waiting for the facilitator</h2><p class="muted">This screen will update when the next activity starts.</p></div>`;
}

function renderTranscriptScreen(participant) {
  const isSubmitted = Boolean(participant.transcript && participant.transcript.trim());
  return `
    <div class="grid two">
      <section class="grid">
        <div>
          <h1>Capture your interview.</h1>
          <p class="lead">Record audio in Chrome or Edge to draft a free live transcript in the browser, then review the text before submitting it for synthesis.</p>
        </div>
        <div class="panel panel-pad">
          <h3>Interview questions</h3>
          <div class="grid">${state.questions.split("\n").filter(Boolean).map((q) => `<p class="submission">${escapeHtml(q)}</p>`).join("")}</div>
        </div>
      </section>
      <form class="panel panel-pad grid" id="transcriptForm">
        <div class="field">
          <label>Name</label>
          <input value="${escapeAttr(participant.name)}" id="participantNameEdit">
        </div>
        <div class="grid">
          <h3>Record audio</h3>
          <div class="row">
            <button type="button" id="recordBtn">Start recording</button>
            <button type="button" class="secondary" id="stopBtn" disabled>Stop</button>
            <span id="recordingStatus" class="muted">Ready</span>
          </div>
          <div id="audioPreview" class="audio-list"></div>
          <input type="file" id="audioUpload" accept="audio/*">
          <p class="note">GitHub Pages uses browser speech recognition while you record. Uploaded audio can be reviewed here, then pasted or typed into the transcript box.</p>
        </div>
        <div class="field">
          <label for="transcript">Transcript</label>
          <textarea id="transcript" placeholder="Record in Chrome or Edge for live transcription, or paste/type the transcript here.">${escapeHtml(participant.transcript || "")}</textarea>
        </div>
        <button type="submit" id="submitTranscript">${isSubmitted ? "Update transcript" : "Submit transcript"}</button>
        ${isSubmitted ? `<p class="note">Submitted. You can still edit until the facilitator advances.</p>` : ""}
      </form>
    </div>
  `;
}

function renderOtherIdeasScreen(participant) {
  return `
    <div class="grid two">
      <section>
        <h1>Anything missing?</h1>
        <p class="lead">Review the generated ideas. Add ideas you think should be represented before top-three ranking begins.</p>
      </section>
      <section class="panel panel-pad grid">
        <h3>Generated ideas</h3>
        ${renderIdeas()}
        <form class="grid" id="otherIdeaForm">
          <div class="field">
            <label for="otherTitle">Other idea</label>
            <input id="otherTitle" required placeholder="A missing idea in one sentence">
          </div>
          <div class="field">
            <label for="otherDescription">Why it matters</label>
            <textarea id="otherDescription" placeholder="Optional detail"></textarea>
          </div>
          <button type="submit">Add idea</button>
        </form>
        <div class="grid">
          <h3>Your added ideas</h3>
          ${participant.otherIdeas?.length ? participant.otherIdeas.map(renderOtherIdea).join("") : `<p class="muted">No additions yet.</p>`}
        </div>
      </section>
    </div>
  `;
}

function renderRankingScreen(participant) {
  const ballot = getBallotIdeas(participant);
  const existing = state.votes.find((vote) => vote.participantId === participant.id);
  return `
    <div class="grid">
      <div>
        <h1>Rank your top 3.</h1>
        <p class="lead">Choose your first, second, and third choice. Your own “Other” ideas are included on your ballot.</p>
      </div>
      <form class="panel panel-pad grid" id="voteForm">
        <div class="rank-grid">
          ${[1, 2, 3].map((rank) => `
            <div class="rank-slot">
              <span>${rank}</span>
              <select name="rank${rank}" required>
                <option value="">Select idea</option>
                ${ballot.map((idea) => `<option value="${idea.id}" ${existing?.ranked?.[rank - 1] === idea.id ? "selected" : ""}>${escapeHtml(idea.title)}</option>`).join("")}
              </select>
            </div>
          `).join("")}
        </div>
        <button type="submit">${existing ? "Update top 3" : "Submit top 3"}</button>
      </form>
      <div class="grid three">${ballot.map(renderIdea).join("")}</div>
    </div>
  `;
}

function renderParticipantResults() {
  const winner = calculateResults()[0];
  return `
    <div class="screen-result">
      ${winner ? `
        <section class="winner">
          <p>Winning idea</p>
          <h1>${escapeHtml(winner.title)}</h1>
          <p>${escapeHtml(winner.description || "")}</p>
        </section>
      ` : `<section class="panel panel-pad"><h1>No result yet.</h1><p class="lead">The facilitator has not collected enough rankings to reveal a winner.</p></section>`}
    </div>
  `;
}

function renderPm() {
  const counts = getCounts();
  return `
    ${renderPhaseStrip()}
    <div class="grid three">
      <div class="stat"><span class="muted">Designers</span><strong>${counts.participants}</strong></div>
      <div class="stat"><span class="muted">Transcripts</span><strong>${counts.transcripts}</strong></div>
      <div class="stat"><span class="muted">Rankings</span><strong>${counts.votes}</strong></div>
    </div>
    <div class="grid two" style="margin-top: 18px">
      <section class="panel panel-pad grid">
        <h2>Facilitator controls</h2>
        <div class="field">
          <label for="workshopName">Workshop name</label>
          <input id="workshopName" value="${escapeAttr(state.workshopName)}">
        </div>
        <div class="field">
          <label for="questions">Interview questions</label>
          <textarea id="questions">${escapeHtml(state.questions)}</textarea>
        </div>
        <div class="row">
          ${phases.map(([id, label]) => `<button type="button" class="${state.phase === id ? "" : "secondary"}" data-phase="${id}">${label}</button>`).join("")}
        </div>
        <div class="row">
          <button type="button" id="generateIdeas">Generate ideas from transcripts</button>
          <button type="button" class="secondary" id="exportData">Export JSON</button>
          <button type="button" class="danger" id="resetWorkshop">Reset</button>
        </div>
      </section>
      <section class="panel panel-pad grid">
        <h2>Idea set</h2>
        <form class="grid" id="manualIdeaForm">
          <div class="field">
            <label for="ideaTitle">Add or merge idea</label>
            <input id="ideaTitle" required placeholder="Idea title">
          </div>
          <textarea id="ideaDescription" placeholder="Short description"></textarea>
          <button type="submit">Add idea</button>
        </form>
        ${renderIdeas(true)}
      </section>
    </div>
    <div class="grid two" style="margin-top: 18px">
      <section class="panel panel-pad grid">
        <h2>Submissions</h2>
        ${state.participants.length ? state.participants.map(renderSubmission).join("") : `<p class="muted">No Designers yet.</p>`}
      </section>
      <section class="panel panel-pad grid">
        <h2>Results</h2>
        ${renderResults()}
      </section>
    </div>
    <section class="panel panel-pad grid" style="margin-top: 18px">
      <h2>Designer additions</h2>
      ${renderParticipantAdditions()}
    </section>
  `;
}

function renderPhaseStrip() {
  return `<div class="status-strip">${phases.map(([id, label]) => `<div class="phase ${state.phase === id ? "active" : ""}">${label}</div>`).join("")}</div>`;
}

function renderIdeas(withControls = false) {
  if (!state.ideas.length) {
    return `<p class="muted">No generated ideas yet.</p>`;
  }

  return `<div class="grid">${state.ideas.map((idea) => renderIdea(idea, withControls)).join("")}</div>`;
}

function renderIdea(idea, withControls = false) {
  return `
    <article class="idea">
      <div class="row" style="justify-content: space-between">
        <div class="idea-title">${escapeHtml(idea.title)}</div>
        ${withControls ? `<button type="button" class="danger" data-delete-idea="${idea.id}">Remove</button>` : ""}
      </div>
      <p class="muted">${escapeHtml(idea.description || "")}</p>
      ${idea.source ? `<small class="muted">Source: ${escapeHtml(idea.source)}</small>` : ""}
    </article>
  `;
}

function renderOtherIdea(idea) {
  return `<div class="other-row"><strong>${escapeHtml(idea.title)}</strong><p class="muted">${escapeHtml(idea.description || "")}</p></div>`;
}

function renderSubmission(participant) {
  const otherCount = participant.otherIdeas?.length || 0;
  const vote = state.votes.find((item) => item.participantId === participant.id);
  return `
    <article class="submission">
      <div class="row" style="justify-content: space-between">
        <strong>${escapeHtml(participant.name)}</strong>
        <span class="muted">${participant.transcript ? "Transcript submitted" : "Waiting"}</span>
      </div>
      <p class="muted">${participant.transcript ? `${participant.transcript.slice(0, 180)}${participant.transcript.length > 180 ? "..." : ""}` : "No transcript yet."}</p>
      <small class="muted">${otherCount} other ideas · ${vote ? "ranked" : "not ranked"}</small>
    </article>
  `;
}

function renderResults() {
  const results = calculateResults();
  if (!results.length) {
    return `<p class="muted">Rankings will appear here after Designers submit their top three.</p>`;
  }

  return `<div class="grid">${results.map((idea) => `
    <div class="ballot-row row" style="justify-content: space-between">
      <div><strong>${escapeHtml(idea.title)}</strong><p class="muted">${escapeHtml(idea.description || "")}</p></div>
      <span class="score">${idea.score}</span>
    </div>
  `).join("")}</div>`;
}

function renderParticipantAdditions() {
  const additions = state.participants.flatMap((participant) =>
    (participant.otherIdeas || []).map((idea) => ({ ...idea, participantName: participant.name }))
  );

  if (!additions.length) {
    return `<p class="muted">Designer “Other” ideas will appear here before ranking.</p>`;
  }

  return `<div class="grid three">${additions.map((idea) => {
    const alreadyPromoted = state.ideas.some((item) => item.promotedFrom === idea.id);
    return `
      <article class="idea">
        <div class="idea-title">${escapeHtml(idea.title)}</div>
        <p class="muted">${escapeHtml(idea.description || "")}</p>
        <small class="muted">Added by ${escapeHtml(idea.participantName)}</small>
        <button type="button" ${alreadyPromoted ? "disabled" : ""} data-promote-other="${idea.id}">
          ${alreadyPromoted ? "Added to ballot" : "Add to ballot"}
        </button>
      </article>
    `;
  }).join("")}</div>`;
}

function bindCommon() {
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => setState({ mode: button.dataset.mode }));
  });
}

function bindParticipant() {
  document.querySelector("#joinForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = event.target.participantName.value.trim();
    if (!name) return;
    const participant = { id: uid("participant"), name, transcript: "", otherIdeas: [] };
    state.participants.push(participant);
    setState({ currentParticipantId: participant.id });
  });

  document.querySelector("#transcriptForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const participant = getCurrentParticipant();
    participant.name = document.querySelector("#participantNameEdit").value.trim() || participant.name;
    participant.transcript = document.querySelector("#transcript").value.trim();
    setState({});
  });

  document.querySelector("#recordBtn")?.addEventListener("click", startRecording);
  document.querySelector("#stopBtn")?.addEventListener("click", stopRecording);
  document.querySelector("#audioUpload")?.addEventListener("change", handleAudioUpload);

  document.querySelector("#otherIdeaForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const participant = getCurrentParticipant();
    const title = event.target.otherTitle.value.trim();
    const description = event.target.otherDescription.value.trim();
    if (!title) return;
    participant.otherIdeas ||= [];
    participant.otherIdeas.push({ id: uid("other"), title, description, source: participant.name });
    setState({});
  });

  document.querySelector("#voteForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const participant = getCurrentParticipant();
    const ranked = [event.target.rank1.value, event.target.rank2.value, event.target.rank3.value];
    if (new Set(ranked).size !== ranked.length) {
      alert("Please choose three different ideas.");
      return;
    }
    state.votes = state.votes.filter((vote) => vote.participantId !== participant.id);
    state.votes.push({ participantId: participant.id, ranked });
    setState({});
  });
}

function bindPm() {
  document.querySelector("#workshopName")?.addEventListener("change", (event) => setState({ workshopName: event.target.value.trim() || "Rapid AI Design Sprint" }));
  document.querySelector("#questions")?.addEventListener("change", (event) => setState({ questions: event.target.value }));

  document.querySelectorAll("[data-phase]").forEach((button) => {
    button.addEventListener("click", () => setState({ phase: button.dataset.phase }));
  });

  document.querySelector("#generateIdeas")?.addEventListener("click", () => {
    const generated = generateIdeasFromTranscripts();
    state.ideas = generated.length ? generated : seedIdeas.map((idea) => ({ ...idea, id: uid("idea"), source: "starter" }));
    setState({ phase: "others" });
  });

  document.querySelector("#manualIdeaForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const title = event.target.ideaTitle.value.trim();
    if (!title) return;
    state.ideas.push({
      id: uid("idea"),
      title,
      description: event.target.ideaDescription.value.trim(),
      source: "PM",
    });
    setState({});
  });

  document.querySelectorAll("[data-delete-idea]").forEach((button) => {
    button.addEventListener("click", () => {
      state.ideas = state.ideas.filter((idea) => idea.id !== button.dataset.deleteIdea);
      state.votes = state.votes.map((vote) => ({ ...vote, ranked: vote.ranked.filter((id) => id !== button.dataset.deleteIdea) }));
      setState({});
    });
  });

  document.querySelectorAll("[data-promote-other]").forEach((button) => {
    button.addEventListener("click", () => {
      const addition = state.participants
        .flatMap((participant) => (participant.otherIdeas || []).map((idea) => ({ ...idea, participantName: participant.name })))
        .find((idea) => idea.id === button.dataset.promoteOther);
      if (!addition) return;
      state.ideas.push({
        id: uid("idea"),
        title: addition.title,
        description: addition.description,
        source: `Other: ${addition.participantName}`,
        promotedFrom: addition.id,
      });
      setState({});
    });
  });

  document.querySelector("#exportData")?.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "rapid-sprint-export.json";
    link.click();
    URL.revokeObjectURL(link.href);
  });

  document.querySelector("#resetWorkshop")?.addEventListener("click", () => {
    if (!confirm("Reset this workshop? This clears local Designers, transcripts, ideas, and votes.")) return;
    localStorage.removeItem(STORAGE_KEY);
    Object.assign(state, loadState());
    render();
  });
}

async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia) {
    document.querySelector("#recordingStatus").textContent = "Recording is not supported here.";
    return;
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  audioChunks = [];
  transcriptBeforeRecording = document.querySelector("#transcript")?.value.trim() || "";
  liveTranscript = "";
  accumulatedSpeechTranscript = "";
  currentSpeechTranscript = "";
  startSpeechRecognition();
  mediaRecorder = new MediaRecorder(stream);
  mediaRecorder.ondataavailable = (event) => audioChunks.push(event.data);
  mediaRecorder.onstop = () => {
    stream.getTracks().forEach((track) => track.stop());
    stopSpeechRecognition();
    const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
    renderAudioPreview(blob);
  };
  mediaRecorder.start();
  recordingStartedAt = Date.now();
  timerId = window.setInterval(updateTimer, 500);
  document.querySelector("#recordBtn").disabled = true;
  document.querySelector("#stopBtn").disabled = false;
  document.querySelector("#recordingStatus").className = "recording";
  updateTimer();
}

function stopRecording() {
  if (mediaRecorder?.state === "recording") {
    mediaRecorder.stop();
  }
  window.clearInterval(timerId);
  document.querySelector("#recordBtn").disabled = false;
  document.querySelector("#stopBtn").disabled = true;
  document.querySelector("#recordingStatus").className = "muted";
  document.querySelector("#recordingStatus").textContent = liveTranscript
    ? "Recording saved. Review the live transcript, then click submit."
    : "Recording saved. Add or paste the transcript before submitting.";
}

function updateTimer() {
  const elapsed = Math.floor((Date.now() - recordingStartedAt) / 1000);
  const minutes = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const seconds = String(elapsed % 60).padStart(2, "0");
  const transcriptionStatus = getSpeechRecognitionConstructor()
    ? "with live transcript"
    : "without live transcript";
  document.querySelector("#recordingStatus").textContent = `Recording ${minutes}:${seconds} ${transcriptionStatus}`;
}

function renderAudioPreview(blob) {
  const url = URL.createObjectURL(blob);
  const preview = document.querySelector("#audioPreview");
  if (!preview) return;
  preview.innerHTML = `<audio controls src="${url}"></audio><p class="note">Use the audio preview to review anything the live transcript missed before you submit.</p>`;
}

function handleAudioUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  renderAudioPreview(file);
  const status = document.querySelector("#recordingStatus");
  if (status) {
    status.className = "muted";
    status.textContent = "Audio loaded. GitHub Pages cannot transcribe uploaded files, so paste or type the transcript below.";
  }
}

function getSpeechRecognitionConstructor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition;
}

function startSpeechRecognition() {
  const SpeechRecognition = getSpeechRecognitionConstructor();
  const status = document.querySelector("#recordingStatus");
  const transcript = document.querySelector("#transcript");

  if (!SpeechRecognition || !transcript) {
    if (status) {
      status.textContent = "Recording audio. Live transcription is not supported in this browser.";
    }
    return;
  }

  speechRecognition = new SpeechRecognition();
  speechRecognition.continuous = true;
  speechRecognition.interimResults = true;
  speechRecognition.lang = navigator.language || "en-US";

  speechRecognition.onresult = (event) => {
    let finalText = "";
    let interimText = "";

    for (let index = 0; index < event.results.length; index += 1) {
      const text = event.results[index][0]?.transcript || "";
      if (event.results[index].isFinal) {
        finalText += `${text} `;
      } else {
        interimText += text;
      }
    }

    currentSpeechTranscript = `${finalText}${interimText}`.trim();
    liveTranscript = [accumulatedSpeechTranscript, currentSpeechTranscript].filter(Boolean).join(" ").trim();
    transcript.value = [transcriptBeforeRecording, liveTranscript].filter(Boolean).join("\n\n");
  };

  speechRecognition.onerror = (event) => {
    if (status) {
      status.className = "recording";
      status.textContent = `Live transcription stopped: ${event.error}. You can still use the audio preview and paste notes.`;
    }
  };

  speechRecognition.onend = () => {
    if (mediaRecorder?.state === "recording") {
      accumulatedSpeechTranscript = [accumulatedSpeechTranscript, currentSpeechTranscript].filter(Boolean).join(" ").trim();
      currentSpeechTranscript = "";
      try {
        speechRecognition.start();
      } catch (error) {
        console.warn("Speech recognition restart skipped.", error);
      }
    }
  };

  try {
    speechRecognition.start();
    if (status) {
      status.textContent = "Recording with live browser transcription...";
    }
  } catch (error) {
    console.warn("Speech recognition could not start.", error);
  }
}

function stopSpeechRecognition() {
  if (!speechRecognition) return;
  speechRecognition.onend = null;
  try {
    speechRecognition.stop();
  } catch (error) {
    console.warn("Speech recognition stop skipped.", error);
  }
  speechRecognition = null;
}

function generateIdeasFromTranscripts() {
  const transcripts = state.participants
    .map((participant) => participant.transcript || "")
    .join(" ")
    .toLowerCase();

  const themes = [
    ["onboarding", "start", "setup", "first", "confusing"],
    ["speed", "slow", "wait", "time", "delay"],
    ["visibility", "status", "progress", "unclear", "feedback"],
    ["trust", "privacy", "confidence", "safe", "verify"],
    ["collaboration", "handoff", "share", "team", "together"],
  ];

  const ideas = themes
    .map((keywords) => {
      const score = keywords.reduce((total, word) => total + countWord(transcripts, word), 0);
      return { keywords, score };
    })
    .filter((theme) => theme.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((theme) => ideaFromTheme(theme.keywords[0]));

  return ideas.length ? ideas : [];
}

function ideaFromTheme(theme) {
  const library = {
    onboarding: ["Streamline onboarding", "Make the first task easier to start with fewer fields, clearer defaults, and guided next steps."],
    speed: ["Reduce waiting time", "Identify slow moments and provide faster paths or visible wait-state feedback."],
    visibility: ["Show progress and status", "Make the journey easier to follow with visible progress, confirmations, and next actions."],
    trust: ["Build confidence into the flow", "Add transparent explanations, review moments, and privacy cues where people feel uncertain."],
    collaboration: ["Support smoother handoffs", "Create clearer ways for teams to share context, decisions, and next steps."],
  };
  const [title, description] = library[theme];
  return { id: uid("idea"), title, description, source: "transcripts" };
}

function countWord(text, word) {
  const matches = text.match(new RegExp(`\\b${word}\\b`, "g"));
  return matches ? matches.length : 0;
}

function calculateResults() {
  const allIdeas = [...state.ideas, ...state.participants.flatMap((participant) => participant.otherIdeas || [])];
  const scores = new Map(allIdeas.map((idea) => [idea.id, { ...idea, score: 0 }]));
  state.votes.forEach((vote) => {
    vote.ranked.forEach((ideaId, index) => {
      const item = scores.get(ideaId);
      if (item) item.score += 3 - index;
    });
  });
  return Array.from(scores.values()).filter((idea) => idea.score > 0).sort((a, b) => b.score - a.score);
}

function getBallotIdeas(participant) {
  return [...state.ideas, ...(participant.otherIdeas || [])];
}

function getCurrentParticipant() {
  return state.participants.find((participant) => participant.id === state.currentParticipantId);
}

function getCounts() {
  return {
    participants: state.participants.length,
    transcripts: state.participants.filter((participant) => participant.transcript?.trim()).length,
    votes: state.votes.length,
  };
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

render();
