"""
Price fetching service using yfinance.

Supports:
  - Saudi stocks (Tadawul): use ticker with .SR suffix, e.g. "2222.SR"
  - US stocks:              standard ticker,          e.g. "AAPL"
  - Crypto:                 yfinance symbol,           e.g. "BTC-USD", "ETH-USD"

yfinance data is delayed ~15 minutes on most exchanges and up to a few hours
on some (Tadawul can be up to 4-5 hours delayed on free tier).

All prices returned by fetch_price / fetch_prices_bulk are in SAR.
"""

import asyncio
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Fixed conversion rates → SAR  (1 unit of foreign currency = X SAR)
CURRENCY_TO_SAR = {
    "USD": 3.75,
    "GBP": 4.73,
    "EUR": 4.08,
    "AED": 1.02,
    "KWD": 12.19,
    "SAR": 1.0,
    # Saudi stocks trade in SAR halala (1/100 SAR) on some feeds — handled below
}


def _to_sar(price: float, currency: str) -> float:
    """Convert a price in `currency` to SAR."""
    cur = (currency or "SAR").strip().upper()
    rate = CURRENCY_TO_SAR.get(cur, 1.0)
    return price * rate


def _candidate_symbols(name: str, asset_type: str) -> list[str]:
    """
    Return a list of ticker symbols to try, in priority order.
    We try multiple variants so that holdings stored under a slightly
    different format (e.g. '2222' vs '2222.SR') still resolve.
    """
    n = name.strip().upper()
    candidates = [n]  # always try as-is first

    if asset_type.lower() == "crypto":
        if "-" not in n:
            candidates = [f"{n}-USD", n]   # BTC → BTC-USD first
        return candidates

    # Saudi stocks: pure digits → try with .SR suffix
    if n.isdigit():
        candidates = [f"{n}.SR", n]
    elif n.endswith(".SR"):
        candidates = [n, n[:-3]]           # also try without suffix

    # Crypto fallback: common crypto tickers stored without -USD suffix
    crypto_bases = {
        "BTC","ETH","BNB","SOL","XRP","USDT","ADA","DOT","DOGE","AVAX",
        "MATIC","LINK","UNI","LTC","BCH","ATOM","FIL","NEAR","APT","ARB",
        "OP","SUI","TRX","TON","SHIB","PEPE","WIF","BONK"
    }
    if n in crypto_bases:
        candidates = [f"{n}-USD", n]

    return candidates


def _get_price_and_currency(symbol: str) -> Optional[tuple[float, str]]:
    """
    Try to get (price, currency) for one exact symbol.
    Returns None if unavailable.
    """
    try:
        import yfinance as yf
        ticker = yf.Ticker(symbol)

        # ── 1. fast_info (fastest, object not dict) ────────────────────────────
        try:
            fi = ticker.fast_info
            price = getattr(fi, "last_price", None) or getattr(fi, "previous_close", None)
            currency = getattr(fi, "currency", None) or "USD"
            if price and float(price) > 0:
                logger.info(f"[price] {symbol} → {float(price):.4f} {currency} (fast_info)")
                return float(price), currency.upper()
        except Exception as e:
            logger.debug(f"[price] {symbol} fast_info failed: {e}")

        # ── 2. .info dict (slower but more complete) ───────────────────────────
        try:
            info = ticker.info
            currency = (info.get("currency") or "USD").upper()
            for key in ("regularMarketPrice", "currentPrice", "previousClose", "navPrice"):
                p = info.get(key)
                if p and float(p) > 0:
                    logger.info(f"[price] {symbol} → {float(p):.4f} {currency} (info.{key})")
                    return float(p), currency
        except Exception as e:
            logger.debug(f"[price] {symbol} .info failed: {e}")

        # ── 3. Recent history (last resort) ───────────────────────────────────
        try:
            hist = ticker.history(period="5d")
            if not hist.empty:
                p = float(hist["Close"].iloc[-1])
                # Try to get currency from fast_info again
                try:
                    currency = (getattr(ticker.fast_info, "currency", None) or "USD").upper()
                except Exception:
                    currency = "USD"
                logger.info(f"[price] {symbol} → {p:.4f} {currency} (history)")
                return p, currency
        except Exception as e:
            logger.debug(f"[price] {symbol} history failed: {e}")

        logger.warning(f"[price] {symbol} → ALL methods returned no price")

    except Exception as e:
        logger.warning(f"[price] {symbol} → outer exception: {e}")
    return None


async def fetch_price(ticker_name: str, asset_type: str) -> Optional[float]:
    """
    Fetch the latest available price for a ticker via yfinance.
    Tries multiple symbol variants (e.g. '2222' and '2222.SR') until one works.
    Returns price in SAR (converted from native currency automatically).
    Returns None if no variant resolves.
    """
    try:
        candidates = _candidate_symbols(ticker_name, asset_type)

        def _try_all():
            for sym in candidates:
                result = _get_price_and_currency(sym)
                if result:
                    price, currency = result
                    sar_price = _to_sar(price, currency)
                    logger.info(
                        f"[price] Resolved '{ticker_name}' → {sym} "
                        f"@ {price:.4f} {currency} = {sar_price:.4f} SAR"
                    )
                    return sar_price
            return None

        loop = asyncio.get_event_loop()
        price = await loop.run_in_executor(None, _try_all)
        return price

    except ImportError:
        logger.error("yfinance not installed. Run: pip install yfinance")
        return None
    except Exception as e:
        logger.warning(f"Could not fetch price for {ticker_name}: {e}")
        return None


async def fetch_prices_bulk(symbols: list[tuple[str, str]]) -> dict[str, Optional[float]]:
    """
    Fetch prices for multiple (name, asset_type) pairs concurrently.
    Returns dict: {original_name: price_in_SAR_or_None}
    """
    tasks = [fetch_price(name, asset_type) for name, asset_type in symbols]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    output = {}
    for (name, _), result in zip(symbols, results):
        if isinstance(result, Exception):
            output[name] = None
        else:
            output[name] = result
    return output
