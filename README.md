# RapidSprint

A browser-based rapid AI design sprint workshop app with two views:

- **Designer**: record or upload interview audio, review the Whisper transcript, submit, add missing ideas, and rank top three ideas.
- **Facilitator**: monitor submissions, generate/edit ideas, review Designer additions, open ranking, and reveal the result.

## Run Locally With Free Whisper Transcription

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

The first transcription will take longer because Whisper downloads the free open-source model. By default the server uses:

```text
WHISPER_MODEL=turbo
WHISPER_DEVICE=cpu
```

If your computer is slow, try a smaller model:

```powershell
$env:WHISPER_MODEL="small"
python server.py
```

## Notes

This app does not put API keys in the browser. Whisper runs on the local Python server, so transcription is free after the model is downloaded.

Whisper also needs `ffmpeg` available on your computer. If transcription fails with an ffmpeg error, install it from:

```text
https://ffmpeg.org/download.html
```
