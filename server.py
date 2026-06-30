import os
import json
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock

from flask import Flask, jsonify, request, send_from_directory


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / ".data" / "sprints"
DATA_DIR.mkdir(parents=True, exist_ok=True)
LOCK = Lock()

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
    return jsonify({"ok": True})


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
