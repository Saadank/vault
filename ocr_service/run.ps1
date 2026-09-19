# Start the VAULT OCR worker on this PC using the system Python.
# Deps come from the root requirements.txt (easyocr/torch install on Windows only).
# Config comes from the root .env (OCR_SHARED_SECRET).

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path "..\.env")) {
    Write-Host "No vault\.env found - create it and set OCR_SHARED_SECRET." -ForegroundColor Red
    exit 1
}

python -m uvicorn main:app --host 127.0.0.1 --port 8765
