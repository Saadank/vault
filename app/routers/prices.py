"""
Prices router:
  GET  /api/prices/search?q=...   — search ticker on Yahoo Finance, return name + price
  POST /api/prices/refresh        — fetch live prices for all holdings, update DB, take snapshot
  GET  /api/prices/chart          — return portfolio value history for charting
  GET  /api/prices/last-updated   — when was the last auto-refresh
"""

import asyncio
import logging

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timedelta
from typing import Optional

from app.database import get_db, User, Holding, CashBalance, PortfolioSnapshot
from app.auth import get_current_user
from app.price_service import fetch_prices_bulk

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/prices", tags=["prices"])


# ── Ticker search (fast — no price fetching, results only) ────────────────────
@router.get("/search")
async def search_ticker(
    q: str = Query(..., min_length=1, description="Ticker or company name to search"),
    user: User = Depends(get_current_user),
):
    """
    Fast search: returns symbol + name + exchange from Yahoo Finance search index.
    No per-result price fetching — use /api/prices/quote?symbol=X to get the price
    after the user selects a result.
    """
    try:
        import yfinance as yf

        def _search():
            q_upper = q.strip().upper()
            results = []
            seen = set()

            # ── 1. Yahoo Finance full-text search (fast, no price calls) ──────
            try:
                search_obj = yf.Search(q, max_results=10, news_count=0)
                quotes = search_obj.quotes if hasattr(search_obj, "quotes") else []
                for item in quotes:
                    sym = item.get("symbol", "")
                    if not sym or sym in seen:
                        continue
                    seen.add(sym)
                    results.append({
                        "symbol": sym,
                        "name": item.get("longname") or item.get("shortname") or sym,
                        "exchange": item.get("exchange", ""),
                        "type": item.get("quoteType", ""),
                        "currency": item.get("currency", ""),
                    })
            except Exception:
                pass

            # ── 2. Direct ticker candidates (Saudi + crypto variants) ─────────
            # Only add if they weren't already in search results
            candidates = []
            if q_upper not in seen:
                candidates.append(q_upper)
            if q.isdigit() and f"{q_upper}.SR" not in seen:
                candidates.append(f"{q_upper}.SR")
            if "-" not in q_upper and not q.isdigit() and f"{q_upper}-USD" not in seen:
                candidates.append(f"{q_upper}-USD")

            for sym in candidates:
                if sym in seen:
                    continue
                try:
                    t = yf.Ticker(sym)
                    fi = t.fast_info
                    # Only include if the ticker actually exists (has a valid exchange)
                    exch = getattr(fi, "exchange", None)
                    if exch:
                        name = sym
                        try:
                            info = t.info
                            name = info.get("longName") or info.get("shortName") or sym
                        except Exception:
                            pass
                        seen.add(sym)
                        results.insert(0, {  # prepend direct match
                            "symbol": sym,
                            "name": name,
                            "exchange": exch,
                            "type": getattr(fi, "quote_type", ""),
                            "currency": getattr(fi, "currency", ""),
                        })
                except Exception:
                    pass

            return results[:8]

        loop = asyncio.get_event_loop()
        results = await loop.run_in_executor(None, _search)
        return {"results": results}

    except ImportError:
        raise HTTPException(503, "yfinance not installed. Run: pip install yfinance")
    except Exception as e:
        logger.error(f"Search error: {e}")
        raise HTTPException(500, f"Search failed: {str(e)}")


# ── Single ticker quote (called after user selects a result) ──────────────────
@router.get("/quote")
async def get_quote(
    symbol: str = Query(..., min_length=1, description="Exact Yahoo Finance ticker symbol"),
    user: User = Depends(get_current_user),
):
    """
    Fetch current price + currency for a single ticker.
    Called after the user selects a search result, so only one network call is made.
    """
    try:
        import yfinance as yf

        def _quote():
            t = yf.Ticker(symbol)
            fi = t.fast_info
            price = getattr(fi, "last_price", None) or getattr(fi, "previous_close", None)
            currency = getattr(fi, "currency", "")
            return {
                "symbol": symbol,
                "price": round(float(price), 4) if price and price > 0 else None,
                "currency": currency,
            }

        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, _quote)
        return result

    except ImportError:
        raise HTTPException(503, "yfinance not installed.")
    except Exception as e:
        logger.warning(f"Quote error for {symbol}: {e}")
        return {"symbol": symbol, "price": None, "currency": ""}


# ── Helper: take a portfolio snapshot ────────────────────────────────────────
async def _take_snapshot(db: AsyncSession, user_id: int):
    """Record today's total portfolio value. Overwrites today's entry if it exists."""
    result = await db.execute(select(Holding).where(Holding.user_id == user_id))
    holdings = result.scalars().all()
    portfolio_value = sum(h.quantity * h.current_price for h in holdings)

    cash_result = await db.execute(select(CashBalance).where(CashBalance.user_id == user_id))
    cash = cash_result.scalar_one_or_none()
    cash_balance = cash.balance if cash else 0.0

    today_str = datetime.utcnow().strftime("%Y-%m-%d")

    # Overwrite today's snapshot if already exists
    existing = await db.execute(
        select(PortfolioSnapshot).where(
            PortfolioSnapshot.user_id == user_id,
            PortfolioSnapshot.snapshot_date == today_str,
        )
    )
    snap = existing.scalar_one_or_none()

    if snap:
        snap.portfolio_value = round(portfolio_value, 2)
        snap.cash_balance    = round(cash_balance, 2)
        snap.total_value     = round(portfolio_value + cash_balance, 2)
    else:
        snap = PortfolioSnapshot(
            user_id=user_id,
            snapshot_date=today_str,
            portfolio_value=round(portfolio_value, 2),
            cash_balance=round(cash_balance, 2),
            total_value=round(portfolio_value + cash_balance, 2),
        )
        db.add(snap)

    await db.commit()


# ── Refresh prices ────────────────────────────────────────────────────────────
@router.post("/refresh")
async def refresh_prices(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Fetch latest prices from Yahoo Finance for all holdings that look like
    market tickers (Stocks, ETFs, Crypto).
    Alternative / Real Estate / Bond holdings are skipped (no ticker).
    Returns a summary of what was updated.
    """
    result = await db.execute(select(Holding).where(Holding.user_id == user.id))
    holdings = result.scalars().all()

    # Only auto-fetch for asset types that have market tickers
    fetchable_types = {"stock", "etf", "crypto"}
    to_fetch = [
        (h.name, h.asset_type)
        for h in holdings
        if h.asset_type.lower() in fetchable_types
    ]

    updated = []
    skipped = []
    failed  = []

    if to_fetch:
        prices = await fetch_prices_bulk(to_fetch)

        for h in holdings:
            if h.asset_type.lower() not in fetchable_types:
                skipped.append(h.name)
                continue

            new_price = prices.get(h.name)
            if new_price and new_price > 0:
                h.current_price = round(new_price, 6)
                updated.append({"name": h.name, "price": h.current_price})
            else:
                logger.warning(f"[refresh] Failed to get price for '{h.name}' (type={h.asset_type})")
                failed.append(h.name)

        await db.commit()

    # Always take a snapshot after refresh (captures current state)
    await _take_snapshot(db, user.id)

    return {
        "updated": updated,
        "skipped": skipped,
        "failed": failed,
        "refreshed_at": datetime.utcnow().isoformat(),
    }


# ── Chart data ────────────────────────────────────────────────────────────────
@router.get("/chart")
async def chart_data(
    range: str = Query("1M", description="1D | 1W | 1M | YTD | 1Y | Max"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Return time-series data for the portfolio value chart.
    Each point: { date: "YYYY-MM-DD", value: float }
    """
    now = datetime.utcnow()

    if range == "1D":
        cutoff = now - timedelta(days=1)
    elif range == "1W":
        cutoff = now - timedelta(weeks=1)
    elif range == "1M":
        cutoff = now - timedelta(days=30)
    elif range == "YTD":
        cutoff = datetime(now.year, 1, 1)
    elif range == "1Y":
        cutoff = now - timedelta(days=365)
    else:  # Max
        cutoff = datetime(2000, 1, 1)

    cutoff_str = cutoff.strftime("%Y-%m-%d")

    result = await db.execute(
        select(PortfolioSnapshot)
        .where(
            PortfolioSnapshot.user_id == user.id,
            PortfolioSnapshot.snapshot_date >= cutoff_str,
        )
        .order_by(PortfolioSnapshot.snapshot_date)
    )
    snapshots = result.scalars().all()

    points = [
        {"date": s.snapshot_date, "value": s.total_value}
        for s in snapshots
    ]

    # If no history yet, return single current point so chart isn't empty
    if not points:
        holdings_result = await db.execute(select(Holding).where(Holding.user_id == user.id))
        holdings = holdings_result.scalars().all()
        portfolio_value = sum(h.quantity * h.current_price for h in holdings)

        cash_result = await db.execute(select(CashBalance).where(CashBalance.user_id == user.id))
        cash = cash_result.scalar_one_or_none()
        cash_balance = cash.balance if cash else 0.0

        points = [{"date": now.strftime("%Y-%m-%d"), "value": round(portfolio_value + cash_balance, 2)}]

    return {"range": range, "points": points}


# ── Snapshot only (no price fetch) ───────────────────────────────────────────
@router.post("/snapshot")
async def take_snapshot(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Retake today's snapshot using current holdings prices + current cash balance.
    Called on page load so the chart always reflects the latest cash changes.
    """
    await _take_snapshot(db, user.id)
    return {"ok": True}


# ── Last updated ──────────────────────────────────────────────────────────────
@router.get("/last-updated")
async def last_updated(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(PortfolioSnapshot)
        .where(PortfolioSnapshot.user_id == user.id)
        .order_by(PortfolioSnapshot.created_at.desc())
    )
    latest = result.scalars().first()
    return {
        "last_updated": latest.created_at.isoformat() if latest else None,
        "snapshot_date": latest.snapshot_date if latest else None,
    }
