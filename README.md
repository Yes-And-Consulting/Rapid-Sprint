# RapidSprint

A browser-based rapid AI design sprint workshop app with two roles:

- **Human**: answer one interview question per screen, submit the interview with a speaker name, vote on ideas, and see the prototype outcome.
- **Facilitator**: create the sprint, review the AI-framed problem and HMW question, review AI-generated interview questions, monitor submissions, generate/add ideas, run voting, and export the result.

Facilitator manages the process. Humans contribute intelligence. AI accelerates in between.

## Hosted App

RapidSprint is designed to run from GitHub Pages with a Render-hosted API.

Public app URL:

```text
https://yes-and-consulting.github.io/Rapid-Sprint/
```

The GitHub Pages site is the participant and facilitator entry point. Humans answer one question per screen, and the Facilitator frames the problem, reviews responses, generates ideas, runs voting, and exports JSON.

A GitHub Pages workflow is included in `.github/workflows/pages.yml`. After pushing to `main` or `master`, GitHub deploys the static app and exposes a live Pages URL. Facilitator invite links and QR codes route Humans to the Human-only view.

Render runs the Flask API for Gemini and shared live sprint state. GitHub Pages is static hosting, so it does not receive interview or voting submissions by itself.

The Flask API supports shared sprint sessions for large groups:

- Facilitator saves sprint state to `/api/sprints/:id`.
- Humans submit interviews to `/api/sprints/:id/interviews`.
- Humans submit ranked top-3 votes to `/api/sprints/:id/votes`.
- The Facilitator hub polls the sprint and updates as Humans submit.

This is designed for workshop-sized groups such as up to 100 Humans submitting interviews and votes into the same sprint.

## Render Deployment

Use Render for the Flask API that powers Gemini and live shared sessions.

1. Push this repo to GitHub.
2. In Render, create a new **Web Service** from this GitHub repo.
3. Use these settings:

```text
Runtime: Python
Build Command: pip install -r requirements.txt
Start Command: gunicorn server:app
Plan: Free
```

4. Add environment variables in Render:

```text
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-2.5-flash
CORS_ORIGIN=https://yes-and-consulting.github.io
```

5. Deploy, then open:

```text
https://your-render-service.onrender.com/api/ai/status
```

It should show `"configured": true`.

6. Copy your Render service URL into `api-config.js`:

```js
window.RAPIDSPRINT_API_BASE = "https://your-render-service.onrender.com";
```

7. Commit and push. GitHub Pages will then call the Render API automatically.

You can also test before editing `api-config.js` by opening:

```text
https://yes-and-consulting.github.io/Rapid-Sprint/?api=https://your-render-service.onrender.com
```

Render free services may sleep after inactivity. The first request after sleeping can take a little longer.

## Facilitator Test Access

The Facilitator flow has a lightweight email/password gate. There is no account creation screen. Human invite links skip this gate.

For early testing, any email address works with one of these passwords:

```text
north-cedar-47
bright-river-82
steady-maple-19
silver-harbor-64
quiet-signal-31
open-canyon-58
clear-meadow-26
warm-anchor-73
fresh-lantern-95
solid-compass-40
```

To rotate or add passwords, edit `FACILITATOR_PASSWORDS` in `app.js`, commit, and push. This is a tester gate, not strong security, because GitHub Pages JavaScript is public.

## Hosted Operations

By default RapidSprint uses:

```text
gemini-2.5-flash
```

Check Gemini configuration on the Render service:

```text
https://rapid-sprint.onrender.com/api/ai/status
```

It should show `"configured": true`. Google documents a Gemini API Free tier with free input and output tokens for supported models, and paid use as a separate upgrade. Free-tier prompts may be used to improve Google products. If Gemini is unavailable or returns malformed JSON, the GitHub Pages app continues with generated draft questions or ideas so a live workshop can proceed.
