"""
OCR router: thin proxy to the self-hosted OCR worker (ocr_service/).

EasyOCR + torch are too heavy for the Railway container, so the actual OCR
runs on a home PC exposed through Tailscale Funnel. This endpoint just
validates the upload, forwards it with a shared secret, and maps failures
to messages the mobile scan sheet can show. See ocr_service/README.md.
"""

import os
import logging
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel

from app.auth import get_current_user
from app.database import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ocr", tags=["ocr"])

# CPU OCR on Arabic+English is slow; give the worker time before we call it dead.
OCR_TIMEOUT_SECONDS = 60.0
ALLOWED_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp"}

OFFLINE_MSG = "Invoice scanner is offline — make sure the OCR service on your PC is running."


class ParsedInvoice(BaseModel):
    """Mirror of ocr_service.ocr_engine.ParsedInvoice — the worker's response shape."""
    action:       str            = "BUY"
    ticker:       Optional[str] = None
    name:         Optional[str] = None
    quantity:     Optional[float] = None
    price:        Optional[float] = None
    total:        Optional[float] = None
    date:         Optional[str] = None   # YYYY-MM-DD
    order_number: Optional[str] = None
    currency:     str            = "USD"


def _service_config() -> tuple[str, str]:
    """Read at request time so Railway variable changes apply without a restart."""
    url = os.getenv("OCR_SERVICE_URL", "").rstrip("/")
    secret = os.getenv("OCR_SHARED_SECRET", "")
    if not url or not secret:
        raise HTTPException(503, "Invoice scanner is not configured (OCR_SERVICE_URL / OCR_SHARED_SECRET).")
    return url, secret


async def _forward_to_worker(
    url: str, secret: str, filename: str, content: bytes, content_type: str
) -> ParsedInvoice:
    try:
        async with httpx.AsyncClient(timeout=OCR_TIMEOUT_SECONDS) as client:
            resp = await client.post(
                f"{url}/parse-invoice",
                headers={"X-OCR-Secret": secret},
                files={"file": (filename, content, content_type)},
            )
    except httpx.TimeoutException:
        logger.warning("OCR worker timed out after %.0fs", OCR_TIMEOUT_SECONDS)
        raise HTTPException(504, "Scan timed out — the OCR service is running but too slow. Try a smaller screenshot.")
    except httpx.HTTPError as e:
        logger.warning("OCR worker unreachable: %s", e)
        raise HTTPException(503, OFFLINE_MSG)

    if resp.status_code == 401:
        logger.error("OCR worker rejected our shared secret")
        raise HTTPException(502, "Invoice scanner rejected the request — OCR_SHARED_SECRET doesn't match the PC's .env.")

    # The tunnel edge (Tailscale Funnel / Cloudflare) answers 502/503/530 itself
    # when the PC is up but the worker isn't listening.
    if resp.status_code in (502, 503, 530):
        logger.warning("OCR tunnel up but origin down (HTTP %s)", resp.status_code)
        raise HTTPException(503, OFFLINE_MSG)

    if resp.status_code >= 400:
        # Worker-side validation / OCR errors (400, 413, 422, 500) — pass the detail through.
        try:
            detail = resp.json().get("detail") or resp.text
        except ValueError:
            detail = resp.text or f"OCR service error ({resp.status_code})"
        raise HTTPException(resp.status_code, detail)

    try:
        return ParsedInvoice(**resp.json())
    except (ValueError, TypeError) as e:
        logger.error("OCR worker returned unexpected body: %s", e)
        raise HTTPException(502, "Invoice scanner returned an unreadable response.")


@router.post("/parse-invoice", response_model=ParsedInvoice)
async def parse_invoice(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    """Parse a Tadawul broker invoice screenshot via the self-hosted OCR worker."""
    ct = (file.content_type or "").lower()
    if ct not in ALLOWED_TYPES:
        raise HTTPException(400, f"Unsupported format: {ct}. Please use JPEG or PNG.")

    url, secret = _service_config()
    content = await file.read()
    return await _forward_to_worker(url, secret, file.filename or "invoice.jpg", content, ct)
