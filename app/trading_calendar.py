"""
Trading-calendar helpers.

Classify an asset's market and tell whether a given calendar date is a
*trading* day for that market. Used by the daily report so that a holding's
"daily change" is measured against the right baseline and closed-market assets
are not credited with phantom moves.

Markets
-------
- ``crypto``  : 24/7 (BTC, ETH, ...) — every day is a trading day.
- ``tadawul`` : Saudi exchange — trades Sun–Thu (closed Fri–Sat).
- ``us``      : US exchanges (NYSE/Nasdaq) — trade Mon–Fri (closed Sat–Sun).

Public holidays are not yet fully enumerated; weekend handling is the primary
non-trading-day rule. Add ISO date strings to the ``*_HOLIDAYS`` sets below to
extend coverage (e.g. Saudi National Day, US Thanksgiving) without touching the
logic.
"""

from datetime import date

# Python date.weekday(): Mon=0, Tue=1, Wed=2, Thu=3, Fri=4, Sat=5, Sun=6
_TADAWUL_TRADING_WEEKDAYS = frozenset({6, 0, 1, 2, 3})  # Sun, Mon, Tue, Wed, Thu
_US_TRADING_WEEKDAYS = frozenset({0, 1, 2, 3, 4})       # Mon–Fri

# Extendable holiday calendars (ISO "YYYY-MM-DD" strings).
TADAWUL_HOLIDAYS: set[str] = set()
US_HOLIDAYS: set[str] = set()

CRYPTO = "crypto"
TADAWUL = "tadawul"
US = "us"


def classify_market(asset_type: str | None, ticker: str | None) -> str:
    """Best-effort market classification from an asset's type and ticker.

    Order matters: crypto first, then Saudi (Tadawul), else US.
    """
    at = (asset_type or "").strip().lower()
    tk = (ticker or "").strip().upper()

    if at == "crypto" or tk.endswith("-USD"):
        return CRYPTO

    # Saudi-listed: Yahoo uses the ``.SR`` suffix; bare 4-digit codes are
    # Tadawul symbols (e.g. 7010 = stc, 1120 = Al Rajhi).
    if tk.endswith(".SR") or (tk.isdigit() and len(tk) == 4):
        return TADAWUL

    # Locally-priced Saudi instruments (sukuk / bonds / local funds) often carry
    # no Yahoo ticker — treat them as Tadawul so weekends close them out.
    if at in ("bond", "sukuk", "fund") and not tk:
        return TADAWUL

    return US


def is_trading_day(market: str, d: date) -> bool:
    """True if ``market`` was open on calendar date ``d``."""
    if market == CRYPTO:
        return True
    iso = d.strftime("%Y-%m-%d")
    if market == TADAWUL:
        return d.weekday() in _TADAWUL_TRADING_WEEKDAYS and iso not in TADAWUL_HOLIDAYS
    # default → US
    return d.weekday() in _US_TRADING_WEEKDAYS and iso not in US_HOLIDAYS
