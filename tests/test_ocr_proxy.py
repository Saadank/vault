"""
Tests for the OCR proxy in app/routers/ocr.py.

The worker (ocr_service/) is mocked with httpx.MockTransport, so these run
without EasyOCR installed. Runnable with plain `python tests/test_ocr_proxy.py`
and also discoverable by pytest.

Validates the error mapping the mobile scan sheet relies on:
  1. Missing env vars        → 503 "not configured"
  2. Worker unreachable      → 503 "offline"
  3. Worker timeout          → 504
  4. Tunnel up, origin down  → 503 "offline"
  5. Secret mismatch (401)   → 502 with a secret hint
  6. Worker 4xx detail       → passed through unchanged
  7. Happy path              → ParsedInvoice populated
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import httpx
from fastapi import HTTPException

from app.routers import ocr


URL, SECRET = "https://ocr.example.com", "s3cret"
IMG = (b"\x89PNG", "image/png")


def _run(coro):
    return asyncio.run(coro)


def _forward_with(handler):
    """Call _forward_to_worker against a fake worker described by `handler`."""
    real_client = httpx.AsyncClient

    def patched(**kw):
        kw["transport"] = httpx.MockTransport(handler)
        return real_client(**kw)

    httpx.AsyncClient = patched
    try:
        return _run(ocr._forward_to_worker(URL, SECRET, "inv.png", IMG[0], IMG[1]))
    finally:
        httpx.AsyncClient = real_client


def _expect_http(fn, status):
    try:
        fn()
    except HTTPException as e:
        assert e.status_code == status, f"expected {status}, got {e.status_code}: {e.detail}"
        return e.detail
    raise AssertionError(f"expected HTTPException {status}, nothing raised")


def test_not_configured_when_env_missing():
    saved = {k: os.environ.pop(k, None) for k in ("OCR_SERVICE_URL", "OCR_SHARED_SECRET")}
    try:
        detail = _expect_http(ocr._service_config, 503)
        assert "not configured" in detail
    finally:
        for k, v in saved.items():
            if v is not None:
                os.environ[k] = v


def test_service_config_strips_trailing_slash():
    os.environ["OCR_SERVICE_URL"] = "https://ocr.example.com/"
    os.environ["OCR_SHARED_SECRET"] = "x"
    try:
        url, _ = ocr._service_config()
        assert url == "https://ocr.example.com"
    finally:
        del os.environ["OCR_SERVICE_URL"], os.environ["OCR_SHARED_SECRET"]


def test_worker_unreachable_maps_to_offline():
    def handler(request):
        raise httpx.ConnectError("refused", request=request)
    detail = _expect_http(lambda: _forward_with(handler), 503)
    assert "offline" in detail


def test_worker_timeout_maps_to_504():
    def handler(request):
        raise httpx.ReadTimeout("slow", request=request)
    detail = _expect_http(lambda: _forward_with(handler), 504)
    assert "timed out" in detail


def test_tunnel_origin_down_maps_to_offline():
    detail = _expect_http(
        lambda: _forward_with(lambda r: httpx.Response(530, text="<html>cloudflare</html>")), 503
    )
    assert "offline" in detail


def test_secret_mismatch_maps_to_502_with_hint():
    detail = _expect_http(
        lambda: _forward_with(lambda r: httpx.Response(401, json={"detail": "Invalid"})), 502
    )
    assert "OCR_SHARED_SECRET" in detail


def test_worker_4xx_detail_passes_through():
    detail = _expect_http(
        lambda: _forward_with(lambda r: httpx.Response(422, json={"detail": "OCR found no text"})), 422
    )
    assert detail == "OCR found no text"


def test_happy_path_forwards_secret_and_file():
    seen = {}

    def handler(request):
        seen["secret"] = request.headers.get("x-ocr-secret")
        seen["url"] = str(request.url)
        seen["multipart"] = b"inv.png" in request.content and IMG[0] in request.content
        return httpx.Response(200, json={
            "action": "SELL", "ticker": "VITL", "name": "Vital Farms",
            "quantity": 10, "price": 33.5, "total": 335.0,
            "date": "2026-06-12", "order_number": "123456789", "currency": "USD",
        })

    result = _forward_with(handler)
    assert seen["secret"] == SECRET
    assert seen["url"] == f"{URL}/parse-invoice"
    assert seen["multipart"]
    assert result.action == "SELL" and result.ticker == "VITL"
    assert result.quantity == 10 and result.total == 335.0


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"  ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
