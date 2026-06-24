import os
import tempfile
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
import whisper


ROOT = Path(__file__).resolve().parent
MODEL_SIZE = os.getenv("WHISPER_MODEL", "turbo")
DEVICE = os.getenv("WHISPER_DEVICE", "cpu")

app = Flask(__name__, static_folder=str(ROOT), static_url_path="")
model = None


def get_model():
    global model
    if model is None:
        model = whisper.load_model(MODEL_SIZE, device=DEVICE)
    return model


@app.get("/")
def index():
    return send_from_directory(ROOT, "index.html")


@app.post("/api/transcribe")
def transcribe():
    audio = request.files.get("audio")
    if audio is None:
        return jsonify({"error": "No audio file was uploaded."}), 400

    suffix = Path(audio.filename or "recording.webm").suffix or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        temp_path = temp_file.name
        audio.save(temp_path)

    try:
        result = get_model().transcribe(
            temp_path,
            beam_size=5,
            fp16=DEVICE != "cpu",
            verbose=False,
        )
        return jsonify({
            "text": result.get("text", "").strip(),
            "language": result.get("language"),
            "model": MODEL_SIZE,
        })
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
    finally:
        try:
            os.remove(temp_path)
        except OSError:
            pass


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5173")), debug=True)
