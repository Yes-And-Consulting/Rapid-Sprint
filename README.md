# RapidSprint

A browser-based rapid AI design sprint workshop app with two roles:

- **Human**: answer one interview question per screen, submit the interview with a speaker name, vote on ideas, and see the prototype outcome.
- **Facilitator**: create the sprint, review AI-generated interview questions, monitor submissions, generate/add ideas, run voting, and export the result.

Facilitator manages the process. Humans contribute intelligence. AI accelerates in between.

## GitHub Pages Version

This app can be previewed as a static GitHub Pages site with no paid API and no secrets.

The hosted version stores sprint state in the browser. Humans answer one question per screen, and the Facilitator reviews responses, generates ideas, runs voting, and exports JSON.

A GitHub Pages workflow is included in `.github/workflows/pages.yml`. After pushing to `main` or `master`, GitHub deploys the static app and exposes a live Pages URL. Facilitator invite links and QR codes route Humans to the Human-only view.

For live multi-device sessions, serve the app with the included Flask API or deploy the same API to a host such as Render, Railway, Fly.io, or Azure. GitHub Pages is static hosting, so it cannot receive interview or voting submissions by itself.

The Flask API supports shared sprint sessions for large groups:

- Facilitator saves sprint state to `/api/sprints/:id`.
- Humans submit interviews to `/api/sprints/:id/interviews`.
- Humans submit ranked top-3 votes to `/api/sprints/:id/votes`.
- The Facilitator hub polls the sprint and updates as Humans submit.

This is designed for workshop-sized groups such as up to 100 Humans submitting interviews and votes into the same sprint.

## Optional Local Server

The Python server is still included if you want to serve the static app locally or use OpenRouter-powered AI generation.

Install Python dependencies:

```powershell
python -m pip install -r requirements.txt
```

Set your OpenRouter API key:

```powershell
$env:OPENROUTER_API_KEY="your-openrouter-api-key"
```

By default the server routes AI requests through current OpenRouter free models:

```text
poolside/laguna-xs-2.1:free, cohere/north-mini-code:free, nvidia/nemotron-3-ultra-550b-a55b:free
```

To override that list, set a comma-separated model list:

```powershell
$env:OPENROUTER_MODELS="model-one:free,model-two:free"
```

Start the local workshop server:

```powershell
python server.py
```

Open:

```text
http://localhost:5173
```

The browser calls the local Flask API, which calls OpenRouter server-side so your API key is not exposed. If the key is missing or OpenRouter is unavailable, RapidSprint falls back to its built-in local question and idea generators.
