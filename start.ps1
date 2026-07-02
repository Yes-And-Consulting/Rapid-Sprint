$ErrorActionPreference = "Stop"

$pythonCommand = Get-Command python -ErrorAction SilentlyContinue
if (-not $pythonCommand) {
  $pythonCommand = Get-Command py -ErrorAction SilentlyContinue
}
if (-not $pythonCommand) {
  Write-Host "Python is not available on PATH. Install Python, then run this script again."
  exit 1
}

if (-not (Test-Path -LiteralPath ".env")) {
  Copy-Item -LiteralPath ".env.example" -Destination ".env"
  Write-Host "Created .env from .env.example. Add your Gemini API key, then run this script again."
  exit 1
}

$envLines = Get-Content -LiteralPath ".env"
$keyLine = $envLines | Where-Object { $_ -match "^\s*GEMINI_API_KEY\s*=" } | Select-Object -First 1
if (-not $keyLine -or $keyLine -match "your-gemini-api-key") {
  Write-Host "Set GEMINI_API_KEY in .env before starting RapidSprint."
  exit 1
}

& $pythonCommand.Source -m pip install -r requirements.txt
& $pythonCommand.Source server.py
