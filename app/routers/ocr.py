"""
OCR router: parse Tadawul broker invoice screenshots using EasyOCR.
No external API — all inference runs locally on-device.
"""

import re
import logging
import tempfile
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel

from app.auth import get_current_user
from app.database import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ocr", tags=["ocr"])

_engine = None


def _get_engine():
    global _engine
    if _engine is None:
        import easyocr
        logger.info("Loading EasyOCR Arabic+English model (first-time ~300 MB download)…")
        _engine = easyocr.Reader(["ar", "en"], gpu=False)
        logger.info("EasyOCR ready.")
    return _engine


def _run_ocr(image_path: Path) -> list[dict]:
    """Run EasyOCR; return list of {text, x1, y1, x2, y2, cx, cy}."""
    results = _get_engine().readtext(str(image_path), detail=1)
    # results: [(bbox, text, confidence), ...]
    # bbox: [[x1,y1],[x2,y1],[x2,y2],[x1,y2]]

    items = []
    for i, (bbox, text, confidence) in enumerate(results):
        if not text or not text.strip() or confidence < 0.3:
            continue
        try:
            xs = [float(p[0]) for p in bbox]
            ys = [float(p[1]) for p in bbox]
            x1, x2 = min(xs), max(xs)
            y1, y2 = min(ys), max(ys)
        except (IndexError, TypeError, ValueError):
            x1, x2 = 0.0, 200.0
            y1, y2 = float(i * 30), float(i * 30 + 25)

        items.append({
            "text": text.strip(),
            "x1": x1, "y1": y1,
            "x2": x2, "y2": y2,
            "cx": (x1 + x2) / 2,
            "cy": (y1 + y2) / 2,
        })

    return items


def _find_value(items: list[dict], label_keywords: list[str], y_tol: float = 35) -> Optional[str]:
    """RTL invoice layout: label on RIGHT, value items to the LEFT on the same row."""
    label = None
    for item in items:
        if any(kw in item["text"] for kw in label_keywords):
            label = item
            break
    if not label:
        return None

    same_row = [
        it for it in items
        if it is not label
        and abs(it["cy"] - label["cy"]) <= y_tol
        and it["cx"] < label["cx"]
    ]
    if not same_row:
        return None

    same_row.sort(key=lambda i: i["x1"])
    return " ".join(it["text"] for it in same_row)


class ParsedInvoice(BaseModel):
    action:       str            = "BUY"
    ticker:       Optional[str] = None
    name:         Optional[str] = None
    quantity:     Optional[float] = None
    price:        Optional[float] = None
    total:        Optional[float] = None
    date:         Optional[str] = None   # YYYY-MM-DD
    order_number: Optional[str] = None
    currency:     str            = "USD"


_SKIP_WORDS = {"AM", "PM", "SP", "ETF", "SAR", "USD", "SR", "INC", "LTD", "THE"}


def _parse_invoice(items: list[dict]) -> ParsedInvoice:
    result   = ParsedInvoice()
    all_text = " ".join(it["text"] for it in items)

    # Image height helps us set dynamic thresholds for retina vs non-retina
    img_h = max((it["y2"] for it in items), default=812)

    # ── Action ──────────────────────────────────────────────────────────────────
    if "بيع" in all_text:
        result.action = "SELL"
    elif "شراء" in all_text:
        result.action = "BUY"

    # ── Ticker: first all-caps short English word in the top 40% of the image ────
    # (Works for both 1x/375px and 3x/1125px retina iPhone screenshots)
    top_cutoff = img_h * 0.40
    top_items = sorted([it for it in items if it["y1"] < top_cutoff], key=lambda i: i["y1"])
    for it in top_items:
        m = re.match(r"^([A-Z]{2,6})$", it["text"].strip())
        if m and m.group(1) not in _SKIP_WORDS:
            result.ticker = m.group(1)
            break

    # ── Stock name: English text on the row just below the ticker ───────────────
    if result.ticker:
        ticker_items = [it for it in items if it["text"].strip() == result.ticker]
        if ticker_items:
            ty = ticker_items[0]["y2"]
            gap = img_h * 0.08   # ~8% of image height below ticker
            name_cands = sorted(
                [it for it in items
                 if it["y1"] > ty and it["y1"] < ty + gap
                 and re.search(r"[A-Za-z]{2,}", it["text"])],
                key=lambda i: i["y1"],
            )
            if name_cands:
                result.name = name_cands[0]["text"].strip()

    # ── Quantity ─────────────────────────────────────────────────────────────────
    qty_text = _find_value(items, ["الكمية"])
    if qty_text:
        m = re.search(r"(\d+)", qty_text)
        if m:
            result.quantity = float(m.group(1))
    if not result.quantity:
        m = re.search(r"(\d+)\s*أسهم", all_text)
        if m:
            result.quantity = float(m.group(1))

    # ── Execution date ────────────────────────────────────────────────────────────
    date_text = _find_value(items, ["تاريخ التنفيذ"]) or all_text
    dates = re.findall(r"(\d{2}/\d{2}/\d{4})", date_text)
    if dates:
        p = dates[0].split("/")
        result.date = f"{p[2]}-{p[1]}-{p[0]}"  # DD/MM/YYYY → YYYY-MM-DD

    # ── Price per share ───────────────────────────────────────────────────────────
    price_text = _find_value(items, ["السعر التنفيذ", "السعر"])
    if price_text:
        m = re.search(r"([\d,]+\.?\d*)", price_text)
        if m:
            result.price = float(m.group(1).replace(",", ""))

    # ── Total ─────────────────────────────────────────────────────────────────────
    total_text = (
        _find_value(items, ["إجمالي التنفيذ", "إجمالي"])
        or _find_value(items, ["قيمة الأمر", "قيمة", "قىمة"])   # OCR may split/misread
    )
    if total_text:
        m = re.search(r"([\d,]+\.?\d*)", total_text)
        if m:
            result.total = float(m.group(1).replace(",", ""))

    # ── Order number ──────────────────────────────────────────────────────────────
    order_text = _find_value(items, ["رقم الأمر", "رقم"])
    if order_text:
        m = re.search(r"(\d{6,12})", order_text)
        if m:
            result.order_number = m.group(1)

    # ── Currency ──────────────────────────────────────────────────────────────────
    if "$" in all_text or "USD" in all_text:
        result.currency = "USD"
    elif "﷼" in all_text or "SAR" in all_text:
        result.currency = "SAR"

    # ── Fallback: find price/total from all USD amounts ────────────────────────────
    if not result.price or not result.total:
        usd_amounts = sorted({
            float(a.replace(",", ""))
            for a in re.findall(r"\$\s*([\d,]+\.?\d*)", all_text)
        })
        if usd_amounts and result.quantity:
            for a in usd_amounts:
                for b in usd_amounts:
                    if a < b and abs(a * result.quantity - b) < 0.5:
                        result.price = result.price or round(a, 4)
                        result.total = result.total or round(b, 2)
                        break
            if not result.price and usd_amounts:
                result.price = min(usd_amounts)
            if not result.total and len(usd_amounts) > 1:
                result.total = max(usd_amounts)

    # ── Infer missing price or total ──────────────────────────────────────────────
    if result.quantity and result.quantity > 0:
        if result.price and not result.total:
            result.total = round(result.price * result.quantity, 2)
        elif result.total and not result.price:
            result.price = round(result.total / result.quantity, 4)

    return result


@router.post("/parse-invoice", response_model=ParsedInvoice)
async def parse_invoice(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    """Parse a Tadawul broker invoice screenshot using local EasyOCR (no API cost)."""
    ALLOWED_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp"}
    ct = (file.content_type or "").lower()
    if ct not in ALLOWED_TYPES:
        raise HTTPException(400, f"Unsupported format: {ct}. Please use JPEG or PNG.")

    suffix = Path(file.filename or "invoice.jpg").suffix.lower() or ".jpg"
    tmp_path: Optional[Path] = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(await file.read())
            tmp_path = Path(tmp.name)

        try:
            items = _run_ocr(tmp_path)
        except ImportError:
            raise HTTPException(
                503,
                "EasyOCR is not installed. Run: pip3 install easyocr"
            )
        except Exception as e:
            logger.exception("OCR error")
            raise HTTPException(500, f"OCR failed: {e}")

        if not items:
            raise HTTPException(422, "OCR found no text — try a clearer screenshot.")

        return _parse_invoice(items)

    finally:
        if tmp_path and tmp_path.exists():
            tmp_path.unlink(missing_ok=True)
