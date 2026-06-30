# RapidSprint

A browser-based rapid AI design sprint workshop app with two roles:

- **Human**: answer one interview question per screen, submit the interview with a speaker name, vote on ideas, and see the prototype outcome.
- **Facilitator**: create the sprint, review AI-generated interview questions, monitor submissions, generate/add ideas, run voting, and export the result.

Facilitator manages the process. Humans contribute intelligence. AI accelerates in between.

## GitHub Pages Version

This app now works as a static GitHub Pages site with no paid API, no server, and no secrets.

The hosted version stores sprint state in the browser. Humans answer one question per screen, and the Facilitator reviews responses, generates ideas, runs voting, and exports JSON.

A GitHub Pages workflow is included in `.github/workflows/pages.yml`. After pushing to `main` or `master`, GitHub deploys the static app and exposes a live Pages URL. Facilitator invite links and QR codes route Humans to the Human-only view.

## Optional Local Server

The Python server is still included if you want to serve the static app locally.

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
