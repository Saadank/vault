"""
Regression tests for the daily-change ("Today's Movers") bug.

Fixtures come straight from vault_daily_change_bug_report.md (the Jun 11 → Jun 12
comparison). Runnable with plain `python3 tests/test_daily_movers.py` (no pytest
required) and also discoverable by pytest.

Validates:
  1. Baseline invariant   — prev_price == stored prior-trading-day close.
  2. Sign / magnitude      — VITL Jun 12 = −3.64% / −22.50 SAR (not +0.57%).
  3. Non-trading day       — Tadawul names absent on a Friday (market closed).
  4. Reconciliation        — Σ daily impact reconciles to the down day, not +359.
"""

import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.report_service import compute_daily_movers
from app.trading_calendar import classify_market, is_trading_day


class H:
    """Minimal stand-in for a Holding row."""
    def __init__(self, name, ticker, asset_type, quantity, current_price):
        self.name = name
        self.ticker = ticker
        self.asset_type = asset_type
        self.quantity = quantity
        self.current_price = current_price


# (name, ticker, asset_type, qty, prev_close Jun 11, curr_price Jun 12,
#  expected_pct, expected_impact)  — from the bug report's "Correct output" table.
FIXTURES = [
    ("SP Funds Global Tech ETF",      "SPTE", "ETF",    9,       178.09,     177.375,    -0.40,  -6.44),
    ("HIMS",                          "HIMS", "Stock",  5,       108.2625,   100.575,    -7.10,  -38.44),
    ("BTC",                           "BTC-USD", "Crypto", 0.0241, 237097.50, 237560.24,  0.20,   11.15),
    ("SP Funds S&P 500 Sharia ETF",   "SPUS", "ETF",    18,      211.95,     212.8125,    0.41,   15.53),
    ("ETH-USD",                       "ETH-USD", "Crypto", 0.4882, 6254.55,   6231.45,    -0.37,  -11.28),
    ("OPEN",                          "OPEN", "Stock",  23.14,   16.7625,    16.65,      -0.67,  -2.60),
    ("STC",                           "7010.SR", "Stock", 90,     44.34,      44.34,       0.00,   0.00),
    ("VITL",                          "VITL", "Stock",  15,      41.25,      39.75,      -3.64,  -22.50),
]

REPORT_DATE = date(2026, 6, 12)  # Friday — Tadawul closed, US open, crypto open


def _build():
    holdings = [H(n, tk, at, q, curr) for (n, tk, at, q, _prev, curr, *_ ) in FIXTURES]
    prev_close = {n: prev for (n, _tk, _at, _q, prev, *_ ) in FIXTURES}
    return holdings, prev_close


def test_market_classification():
    assert classify_market("Crypto", "BTC-USD") == "crypto"
    assert classify_market("Stock", "7010.SR") == "tadawul"
    assert classify_market("Stock", "1120.SR") == "tadawul"
    assert classify_market("Stock", "7010") == "tadawul"      # bare 4-digit Saudi code
    assert classify_market("Stock", "VITL") == "us"
    assert classify_market("ETF", "SPUS") == "us"


def test_trading_calendar_friday():
    fri = date(2026, 6, 12)
    assert is_trading_day("tadawul", fri) is False   # Tadawul closed Fri/Sat
    assert is_trading_day("us", fri) is True          # US open Fri
    assert is_trading_day("crypto", fri) is True
    # Saudi weekend boundaries
    assert is_trading_day("tadawul", date(2026, 6, 13)) is False  # Sat
    assert is_trading_day("tadawul", date(2026, 6, 14)) is True   # Sun
    # US weekend
    assert is_trading_day("us", date(2026, 6, 13)) is False       # Sat
    assert is_trading_day("us", date(2026, 6, 15)) is True        # Mon


def test_baseline_and_sign():
    holdings, prev_close = _build()
    movers = compute_daily_movers(REPORT_DATE, holdings, prev_close)
    by_name = {m["name"]: m for m in movers}

    # AC #3 — Tadawul closed on Friday → STC excluded entirely.
    assert "STC" not in by_name, "Closed-market asset must be excluded from movers"

    for (name, _tk, _at, _q, prev, curr, exp_pct, exp_impact) in FIXTURES:
        if name == "STC":
            continue
        m = by_name[name]
        # AC #1 — baseline invariant: prev == stored prior close.
        assert abs(m["prev_price"] - prev) < 1e-9, f"{name} prev baseline wrong"
        # AC #2 — sign + magnitude.
        assert abs(m["daily_pct"] - exp_pct) < 0.01, (
            f"{name}: pct {m['daily_pct']:.2f} != {exp_pct:.2f}")
        assert abs(m["daily_sar"] - exp_impact) < 0.01, (
            f"{name}: impact {m['daily_sar']:.2f} != {exp_impact:.2f}")

    # Explicit VITL check (smoking gun).
    vitl = by_name["VITL"]
    assert vitl["daily_pct"] < 0, "VITL must be a DOWN day"
    assert abs(vitl["daily_pct"] - (-3.64)) < 0.01
    assert abs(vitl["daily_sar"] - (-22.50)) < 0.01


def test_reconciliation_down_day():
    """AC #4 — the corrected movers sum to a DOWN day (~−54.58), not +359.75."""
    holdings, prev_close = _build()
    movers = compute_daily_movers(REPORT_DATE, holdings, prev_close)
    total_impact = sum(m["daily_sar"] for m in movers)
    # Corrected total price impact from held movers ≈ −54.58 SAR.
    assert total_impact < 0, f"Expected a down day, got {total_impact:+.2f}"
    assert abs(total_impact - (-54.58)) < 0.5, f"Total impact {total_impact:+.2f} off"


def _run_all():
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    failures = 0
    for t in tests:
        try:
            t()
            print(f"  PASS  {t.__name__}")
        except AssertionError as e:
            failures += 1
            print(f"  FAIL  {t.__name__}: {e}")
    print(f"\n{len(tests) - failures}/{len(tests)} passed")
    return failures


if __name__ == "__main__":
    sys.exit(1 if _run_all() else 0)
