import os
import json
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock

from flask import Flask, jsonify, request, send_from_directory


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / ".data" / "sprints"
DATA_DIR.mkdir(parents=True, exist_ok=True)
LOCK = Lock()
OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions"
DEFAULT_OPENROUTER_MODELS = [
    "nvidia/nemotron-3-ultra-550b-a55b:free",
    "poolside/laguna-xs-2.1:free",
    "meta-llama/llama-3.2-3b-instruct:free",
]

app = Flask(__name__, static_folder=str(ROOT), static_url_path="")


@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = os.getenv("CORS_ORIGIN", "*")
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,OPTIONS"
    return response


@app.route("/api/<path:_path>", methods=["OPTIONS"])
def api_options(_path):
    return ("", 204)


@app.get("/")
def index():
    return send_from_directory(ROOT, "index.html")


def sprint_path(sprint_id):
    safe_id = "".join(char for char in sprint_id if char.isalnum() or char in "-_")
    return DATA_DIR / f"{safe_id}.json"


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def openrouter_models():
    raw_models = os.getenv("OPENROUTER_MODELS") or os.getenv("OPENROUTER_MODEL") or ""
    models = [model.strip() for model in raw_models.split(",") if model.strip()]
    return models or DEFAULT_OPENROUTER_MODELS


def extract_json_object(content):
    cleaned = (content or "").strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        if lines:
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()

    start = min([index for index in [cleaned.find("{"), cleaned.find("[")] if index >= 0], default=-1)
    if start > 0:
        cleaned = cleaned[start:]

    parsed, _index = json.JSONDecoder().raw_decode(cleaned)
    return parsed


def openrouter_chat(prompt, task):
    api_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY is not configured.")

    payload = {
        "models": openrouter_models(),
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a senior UX researcher and service designer generating JSON for a rapid design sprint app. "
                    "Synthesize the user's specific context before writing. "
                    "Return only valid JSON. Do not include markdown, commentary, or code fences."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        "max_tokens": 1800 if task == "generate_ideas" else 900,
        "temperature": 0.35,
    }
    body = json.dumps(payload).encode("utf-8")
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": os.getenv("OPENROUTER_SITE_URL", "http://localhost:5173"),
        "X-Title": os.getenv("OPENROUTER_APP_NAME", "RapidSprint"),
    }
    request_obj = urllib.request.Request(OPENROUTER_CHAT_URL, data=body, headers=headers, method="POST")

    with urllib.request.urlopen(request_obj, timeout=45) as response:
        result = json.loads(response.read().decode("utf-8"))

    content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
    if not content:
        raise RuntimeError("OpenRouter returned an empty response.")
    return {
        "model": result.get("model", ""),
        "content": content,
        "json": extract_json_object(content),
    }


def read_sprint(sprint_id):
    path = sprint_path(sprint_id)
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_sprint(sprint):
    sprint["updatedAt"] = now_iso()
    path = sprint_path(sprint["id"])
    temp_path = path.with_suffix(".tmp")
    with temp_path.open("w", encoding="utf-8") as handle:
        json.dump(sprint, handle, indent=2)
    temp_path.replace(path)
    return sprint


@app.get("/api/health")
def health():
    return jsonify({"ok": True, "ai": bool(os.getenv("OPENROUTER_API_KEY", "").strip())})


@app.post("/api/ai/generate")
def post_ai_generate():
    payload = request.get_json(silent=True) or {}
    task = payload.get("task")
    prompt = payload.get("prompt")
    if task not in {"generate_interview_questions", "generate_ideas"} or not isinstance(prompt, str):
        return jsonify({"error": "Expected task and prompt."}), 400

    try:
        result = openrouter_chat(prompt, task)
    except RuntimeError as error:
        return jsonify({"error": str(error)}), 503
    except urllib.error.HTTPError as error:
        details = error.read().decode("utf-8", errors="replace")
        return jsonify({"error": "OpenRouter request failed.", "details": details}), error.code
    except Exception as error:
        return jsonify({"error": "AI generation failed.", "details": str(error)}), 502

    return jsonify(result)


@app.get("/api/sprints/<sprint_id>")
def get_sprint(sprint_id):
    with LOCK:
        sprint = read_sprint(sprint_id)
    if sprint is None:
        return jsonify({"error": "Sprint not found."}), 404
    return jsonify({"sprint": sprint})


@app.put("/api/sprints/<sprint_id>")
def put_sprint(sprint_id):
    payload = request.get_json(silent=True) or {}
    sprint = payload.get("sprint")
    if not isinstance(sprint, dict):
        return jsonify({"error": "Expected sprint object."}), 400
    sprint["id"] = sprint_id
    with LOCK:
        existing = read_sprint(sprint_id) or {}
        sprint["interviewResponses"] = existing.get("interviewResponses", sprint.get("interviewResponses", []))
        sprint["votes"] = existing.get("votes", sprint.get("votes", []))
        saved = write_sprint(sprint)
    return jsonify({"sprint": saved})


@app.post("/api/sprints/<sprint_id>/interviews")
def post_interview(sprint_id):
    payload = request.get_json(silent=True) or {}
    human_id = payload.get("humanId")
    responses = payload.get("responses")
    if not human_id or not isinstance(responses, list):
        return jsonify({"error": "Expected humanId and responses array."}), 400

    with LOCK:
        sprint = read_sprint(sprint_id)
        if sprint is None:
            return jsonify({"error": "Sprint not found."}), 404
        sprint["interviewResponses"] = [
            response for response in sprint.get("interviewResponses", [])
            if response.get("humanId") != human_id
        ]
        sprint["interviewResponses"].extend(responses)
        saved = write_sprint(sprint)
    return jsonify({"sprint": saved})


@app.post("/api/sprints/<sprint_id>/votes")
def post_vote(sprint_id):
    payload = request.get_json(silent=True) or {}
    human_id = payload.get("humanId")
    ranked = payload.get("ranked")
    if not human_id or not isinstance(ranked, list):
        return jsonify({"error": "Expected humanId and ranked array."}), 400

    with LOCK:
        sprint = read_sprint(sprint_id)
        if sprint is None:
            return jsonify({"error": "Sprint not found."}), 404
        sprint["votes"] = [
            vote for vote in sprint.get("votes", [])
            if vote.get("humanId") != human_id
        ]
        sprint["votes"].append({
            "id": payload.get("id"),
            "humanId": human_id,
            "ranked": ranked,
            "submittedAt": payload.get("submittedAt") or now_iso(),
        })
        saved = write_sprint(sprint)
    return jsonify({"sprint": saved})


@app.get("/<path:path>")
def static_files(path):
    return send_from_directory(ROOT, path)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5173")), debug=True)
