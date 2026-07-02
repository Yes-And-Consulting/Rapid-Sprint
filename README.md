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

The Python server is included if you want to serve the static app locally, share live sprint state, or use real AI generation.

Install Python dependencies:

```powershell
python -m pip install -r requirements.txt
```

Start the local workshop server:

```powershell
python server.py
```

Open:

```text
http://localhost:5173
```

AI buttons call a real remote LLM service. When the Flask API is running, the browser calls the local API first and the server calls the LLM provider. With no OpenRouter key configured, the server uses Pollinations' free text generation endpoint. If the static app is running without Flask, the browser calls Pollinations directly.

This means the challenge and interview text are sent to the remote AI provider when you click an `[AI]` button.

## Optional OpenRouter

If you set an OpenRouter key, the server tries OpenRouter first and falls back to Pollinations if OpenRouter is unavailable.

Set your OpenRouter API key before starting the server:

```powershell
$env:OPENROUTER_API_KEY="your-openrouter-api-key"
```

By default the OpenRouter route uses current free models:

```text
nvidia/nemotron-3-ultra-550b-a55b:free, poolside/laguna-xs-2.1:free, meta-llama/llama-3.2-3b-instruct:free
```

To override that list, set a comma-separated model list:

```powershell
$env:OPENROUTER_MODELS="model-one:free,model-two:free"
```

If both remote AI providers are unavailable, RapidSprint falls back to its built-in local question and idea generators and shows an alert.
