import os
import json
import re
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
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"

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


def gemini_model():
    return os.getenv("GEMINI_MODEL", DEFAULT_GEMINI_MODEL).strip() or DEFAULT_GEMINI_MODEL


def extract_balanced_json(content):
    cleaned = (content or "").strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        if lines:
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()

    start = min([index for index in [cleaned.find("{"), cleaned.find("[")] if index >= 0], default=-1)
    if start < 0:
        return cleaned

    opener = cleaned[start]
    closer = "}" if opener == "{" else "]"
    depth = 0
    in_string = False
    escaped = False

    for index in range(start, len(cleaned)):
        char = cleaned[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
        elif char == opener:
            depth += 1
        elif char == closer:
            depth -= 1
            if depth == 0:
                return cleaned[start:index + 1]

    return cleaned[start:]


def repair_json_like_text(cleaned):
    repaired = cleaned.strip()
    repaired = re.sub(r",\s*([}\]])", r"\1", repaired)
    repaired = re.sub(r"([{,]\s*)([A-Za-z_][A-Za-z0-9_-]*)\s*:", r'\1"\2":', repaired)
    repaired = re.sub(r":\s*'([^'\\]*(?:\\.[^'\\]*)*)'", lambda match: ': ' + json.dumps(match.group(1)), repaired)
    return repaired


def extract_json_object(content):
    cleaned = extract_balanced_json(content)
    try:
        parsed, _index = json.JSONDecoder().raw_decode(cleaned)
        return parsed
    except json.JSONDecodeError:
        repaired = repair_json_like_text(cleaned)
        parsed, _index = json.JSONDecoder().raw_decode(repaired)
        return parsed


def gemini_response_schema(task):
    if task == "frame_problem":
        return {
            "type": "OBJECT",
            "properties": {
                "problemSummary": {"type": "STRING"},
                "hmwQuestion": {"type": "STRING"},
            },
            "required": ["problemSummary", "hmwQuestion"],
        }

    if task == "generate_interview_questions":
        return {
            "type": "OBJECT",
            "properties": {
                "questions": {
                    "type": "ARRAY",
                    "items": {
                        "type": "OBJECT",
                        "properties": {
                            "type": {"type": "STRING"},
                            "title": {"type": "STRING"},
                            "question": {"type": "STRING"},
                        },
                        "required": ["type", "title", "question"],
                    },
                },
            },
            "required": ["questions"],
        }

    return {
        "type": "OBJECT",
        "properties": {
            "ideas": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "id": {"type": "INTEGER"},
                        "title": {"type": "STRING"},
                        "description": {"type": "STRING"},
                        "confidence": {
                            "type": "STRING",
                            "enum": ["High", "Medium", "Low"],
                        },
                    },
                    "required": ["id", "title", "description", "confidence"],
                },
            },
        },
        "required": ["ideas"],
    }


def gemini_status():
    return {
        "configured": bool(os.getenv("GEMINI_API_KEY", "").strip()),
        "provider": "gemini",
        "model": gemini_model(),
    }


def extract_gemini_text(result):
    candidates = result.get("candidates") or []
    if not candidates:
        raise RuntimeError("Gemini returned no candidates.")

    parts = candidates[0].get("content", {}).get("parts") or []
    text = "".join(part.get("text", "") for part in parts if isinstance(part, dict))
    if not text:
        raise RuntimeError("Gemini returned an empty response.")
    return text


def gemini_generate(prompt, task):
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured.")

    payload = {
        "systemInstruction": {
            "parts": [{
                "text": (
                    "You are a senior UX researcher and service designer generating JSON for a rapid design sprint app. "
                    "Synthesize the user's specific context before writing. "
                    "Return only valid JSON. Do not include markdown, commentary, or code fences."
                )
            }]
        },
        "contents": [{
            "role": "user",
            "parts": [{"text": prompt}],
        }],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 4096 if task == "generate_ideas" else 2048,
            "responseMimeType": "application/json",
            "responseSchema": gemini_response_schema(task),
        },
    }
    body = json.dumps(payload).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    url = f"{GEMINI_API_URL.format(model=gemini_model())}?key={api_key}"
    request_obj = urllib.request.Request(url, data=body, headers=headers, method="POST")

    with urllib.request.urlopen(request_obj, timeout=60) as response:
        result = json.loads(response.read().decode("utf-8"))

    content = extract_gemini_text(result)
    try:
        parsed_json = extract_json_object(content)
    except json.JSONDecodeError as error:
        raise RuntimeError("Gemini returned malformed JSON. The hosted app can retry or use a generated draft.") from error

    return {
        "provider": "gemini",
        "model": gemini_model(),
        "content": content,
        "json": parsed_json,
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
    status = gemini_status()
    return jsonify({
        "ok": True,
        "ai": status["configured"],
        "aiProvider": status["provider"],
        "aiModel": status["model"],
    })


@app.post("/api/ai/generate")
def post_ai_generate():
    payload = request.get_json(silent=True) or {}
    task = payload.get("task")
    prompt = payload.get("prompt")
    if task not in {"frame_problem", "generate_interview_questions", "generate_ideas"} or not isinstance(prompt, str):
        return jsonify({"error": "Expected task and prompt."}), 400

    try:
        result = gemini_generate(prompt, task)
    except RuntimeError as error:
        return jsonify({"error": str(error)}), 503
    except urllib.error.HTTPError as error:
        details = error.read().decode("utf-8", errors="replace")
        return jsonify({"error": f"Gemini request failed: {details}", "details": details}), error.code
    except Exception as error:
        details = str(error)
        return jsonify({"error": f"AI generation failed: {details}", "details": details}), 502

    return jsonify(result)


@app.get("/api/ai/status")
def get_ai_status():
    return jsonify(gemini_status())


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
