import os
from pathlib import Path

from flask import Flask, send_from_directory


ROOT = Path(__file__).resolve().parent

app = Flask(__name__, static_folder=str(ROOT), static_url_path="")


@app.get("/")
def index():
    return send_from_directory(ROOT, "index.html")


@app.get("/<path:path>")
def static_files(path):
    return send_from_directory(ROOT, path)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5173")), debug=True)
