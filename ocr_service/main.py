"""
VAULT OCR worker — standalone FastAPI service that runs EasyOCR on a home PC.

The Railway deploy proxies /api/ocr/parse-invoice to this service through
Tailscale Funnel; see README.md for setup. Requests must carry the shared
secret in the X-OCR-Secret header.

Run:  uvicorn main:app --host 127.0.0.1 --port 8765
"""

import os
import hmac
import logging
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool

import ocr_engine
from ocr_engine import ParsedInvoice

# Shares the main app's .env (vault/.env) — OCR_SHARED_SECRET lives there.
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("ocr_service")

SHARED_SECRET = os.getenv("OCR_SHARED_SECRET", "")
MAX_UPLOAD_BYTES = int(os.getenv("OCR_MAX_UPLOAD_MB", "10")) * 1024 * 1024
ALLOWED_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not SHARED_SECRET:
        logger.error("OCR_SHARED_SECRET is not set in vault/.env — every request will be rejected.")
    # Warm the model at startup so the first scan isn't a 30 s wait.
    await run_in_threadpool(ocr_engine.get_engine)
    yield


app = FastAPI(title="VAULT OCR worker", lifespan=lifespan)


def _check_secret(x_ocr_secret: Optional[str]) -> None:
    if not SHARED_SECRET or not x_ocr_secret or not hmac.compare_digest(x_ocr_secret, SHARED_SECRET):
        raise HTTPException(401, "Invalid or missing X-OCR-Secret header.")


@app.get("/health")
async def health():
    return {"ok": True, "engine_loaded": ocr_engine.engine_loaded()}


@app.post("/parse-invoice", response_model=ParsedInvoice)
async def parse_invoice(
    file: UploadFile = File(...),
    x_ocr_secret: Optional[str] = Header(default=None),
):
    _check_secret(x_ocr_secret)

    ct = (file.content_type or "").lower()
    if ct not in ALLOWED_TYPES:
        raise HTTPException(400, f"Unsupported format: {ct}. Please use JPEG or PNG.")

    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"Image too large (max {MAX_UPLOAD_BYTES // (1024 * 1024)} MB).")

    suffix = Path(file.filename or "invoice.jpg").suffix.lower() or ".jpg"
    tmp_path: Optional[Path] = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(data)
            tmp_path = Path(tmp.name)

        try:
            items = await run_in_threadpool(ocr_engine.run_ocr, tmp_path)
        except Exception as e:
            logger.exception("OCR error")
            raise HTTPException(500, f"OCR failed: {e}")

        if not items:
            raise HTTPException(422, "OCR found no text — try a clearer screenshot.")

        return ocr_engine.parse_invoice(items)

    finally:
        if tmp_path and tmp_path.exists():
            tmp_path.unlink(missing_ok=True)
