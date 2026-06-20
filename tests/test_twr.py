"""
Unit tests for the TWR (_compute_twr) function.

Run with:
    pytest tests/test_twr.py -v
or simply:
    python3 tests/test_twr.py
"""

import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.routers.analytics import _compute_twr


# ── Minimal stubs ─────────────────────────────────────────────────────────────

class Snap:
    def __init__(self, date, total_value, cash_balance, created_at=None):
        self.snapshot_date = date
        self.total_value = total_value
        self.cash_balance = cash_balance
        self.created_at = created_at or datetime.fromisoformat(date + "T12:00:00")


class Tx:
    def __init__(self, tx_date, tx_type, total, realized_pnl=None):
        self.tx_date = tx_date
        self.tx_type = tx_type
        self.total = total
        self.realized_pnl = realized_pnl


# ── Test 1: TWR spec worked example ───────────────────────────────────────────
# value 2000 → 2100 → 1900 → deposit 1000 + buy asset → portfolio ends at 2900
# The last day's return_i must be exactly 0% (deposit fully neutralized).

def test_twr_worked_example():
    snaps = [
        Snap("2026-01-01", 2000.0, 500.0),
        Snap("2026-01-02", 2100.0, 500.0),
        Snap("2026-01-03", 1900.0, 500.0),
        Snap("2026-01-04", 2900.0, 500.0),  # deposit 1000 happened, assets unchanged
    ]
    txs = [
        Tx("2026-01-04", "DEPOSIT", 1000.0),
        Tx("2026-01-04", "BUY",     1000.0),  # cash → asset (internal move, not flow)
    ]
    result = _compute_twr(snaps, txs)

    series = result["series"]
    assert len(series) == 4

    # Day 1→2: +5.0%
    r1 = (series[1]["twr_index"] / series[0]["twr_index"]) - 1
    assert abs(r1 - 0.05) < 1e-9, f"Expected +5% on day 2, got {r1:.6f}"

    # Day 2→3: −9.523…%
    r2 = (series[2]["twr_index"] / series[1]["twr_index"]) - 1
    assert abs(r2 - (-200/2100)) < 1e-6, f"Unexpected day-3 return: {r2:.6f}"

    # Day 3→4: exactly 0% (deposit neutralized)
    r3 = (series[3]["twr_index"] / series[2]["twr_index"]) - 1
    assert abs(r3) < 1e-9, f"Day-4 return must be 0%%, got {r3:.10f}"

    # net_flow for day 4 should be +1000 (only DEPOSIT counts as external flow)
    assert series[3]["net_flow"] == 1000.0


# ── Test 2: backfill day flagged when a recorded deposit didn't land same-day ──
# Day 2 records an 8000 deposit but total_value barely moves (+100) — the cash
# was backfilled/lagged into a later snapshot.

def test_backfill_gap_excluded():
    snaps = [
        Snap("2026-01-01", 10000.0, 5000.0),
        Snap("2026-01-02", 10100.0, 5100.0),   # deposit 8000 recorded, value +100 only → BAD
        Snap("2026-01-03", 18100.0, 13100.0),  # the 8000 finally landed (no flow recorded) → start
        Snap("2026-01-04", 18281.0, 13100.0),  # +1% clean growth
    ]
    txs = [Tx("2026-01-02", "DEPOSIT", 8000.0)]
    result = _compute_twr(snaps, txs)

    assert "2026-01-02" in result["excluded_days"]
    # TWR must start the day AFTER the bad day
    assert result["twr_start_date"] == "2026-01-03", (
        f"Expected TWR start at 2026-01-03, got {result['twr_start_date']}"
    )
    assert result["twr_start_reason"] is not None
    assert result["series"][0]["date"] == "2026-01-03"


# ── Test 2b: REQUIRED — backfill gap in the MIDDLE of the series ───────────────
# 20 clean days, then 1 bad deposit day (value barely moves), then clean days.
# Catches the exact bug that shipped: a detector that only checks the start.

def test_backfill_gap_midseries():
    snaps = []
    # 20 clean flat days, no flows (2026-01-01 .. 2026-01-20)
    for day in range(1, 21):
        snaps.append(Snap(f"2026-01-{day:02d}", 10000.0, 2000.0))
    # Day 21: big deposit recorded, value barely moves → BAD (mid-series)
    snaps.append(Snap("2026-01-21", 10100.0, 2100.0))
    # Days 22-24: the 5000 landed, then clean +1%/day growth
    snaps.append(Snap("2026-01-22", 15100.0, 7100.0))   # start date
    snaps.append(Snap("2026-01-23", 15251.0, 7100.0))   # +1%
    snaps.append(Snap("2026-01-24", 15403.51, 7100.0))  # +1%
    txs = [Tx("2026-01-21", "DEPOSIT", 5000.0)]

    result = _compute_twr(snaps, txs)

    # 1. The mid-series bad day is flagged
    assert result["excluded_days"] == ["2026-01-21"], result["excluded_days"]
    # 2. TWR starts the day AFTER the bad day — NOT day 1 of the series
    assert result["twr_start_date"] == "2026-01-22", result["twr_start_date"]
    assert result["series"][0]["date"] == "2026-01-22"
    # 3. Final TWR computed only from the clean post-gap window (~+2.01%)
    assert abs(result["cumulative_return_pct"] - 2.01) < 0.05, result["cumulative_return_pct"]


# ── Test 2c: non-contiguous bad days — start after the LAST one ────────────────
# Mirrors production: Feb 24-25 bad, clean stretch, then Mar 7 & Mar 9 bad again.

def test_backfill_noncontiguous_starts_after_last():
    snaps = [
        Snap("2026-02-23", 10000.0, 5000.0),
        Snap("2026-02-24", 10050.0, 5050.0),   # deposit 3000 recorded, +50 only → BAD
        Snap("2026-02-25", 13100.0, 8100.0),   # clean (3000 landed, no flow)
        Snap("2026-02-26", 13150.0, 8100.0),   # clean
        Snap("2026-02-27", 13200.0, 8100.0),   # clean
        Snap("2026-02-28", 16280.0, 11180.0),  # deposit 3000 recorded → value +3080 ≈ clean
        Snap("2026-03-01", 16300.0, 11200.0),  # bad late day: deposit 2000, +20 only → BAD
        Snap("2026-03-02", 18300.0, 13200.0),  # the 2000 landed → start date
        Snap("2026-03-03", 18483.0, 13200.0),  # +1%
    ]
    txs = [
        Tx("2026-02-24", "DEPOSIT", 3000.0),
        Tx("2026-02-28", "DEPOSIT", 3000.0),
        Tx("2026-03-01", "DEPOSIT", 2000.0),
    ]
    result = _compute_twr(snaps, txs)

    assert "2026-02-24" in result["excluded_days"]
    assert "2026-03-01" in result["excluded_days"]
    assert "2026-02-28" not in result["excluded_days"]  # clean deposit day
    # Start after the LAST bad day (Mar 1), not the first (Feb 24)
    assert result["twr_start_date"] == "2026-03-02", result["twr_start_date"]


# ── Test 3: CAPITAL_INCREASE excluded from cash-flow calculations ─────────────
# A CAPITAL_INCREASE transaction must not affect net_flow.

def test_capital_increase_excluded_from_flow():
    snaps = [
        Snap("2026-01-01", 5000.0, 1000.0),
        Snap("2026-01-02", 5000.0, 1000.0),
    ]
    txs = [
        Tx("2026-01-02", "CAPITAL_INCREASE", 0.0),
        Tx("2026-01-02", "CAPITAL_INCREASE", 9999.0),  # large amount — must be ignored
    ]
    result = _compute_twr(snaps, txs)

    # No unreliable days — CAPITAL_INCREASE must not inflate cash flow
    assert result["twr_start_date"] == "2026-01-01"
    assert result["series"][1]["net_flow"] == 0.0, (
        f"CAPITAL_INCREASE leaked into net_flow: {result['series'][1]['net_flow']}"
    )


# ── Test 4: snapshot deduplication — latest created_at per calendar day ───────
# If three snapshots exist for the same day, TWR must use only the last one.

def test_snapshot_deduplication_keeps_latest():
    from collections import defaultdict

    # Simulate the deduplication logic used in the endpoint
    raw = [
        Snap("2026-01-01", 1000.0, 200.0, datetime(2026, 1, 1, 8, 0, 0)),
        Snap("2026-01-01", 1050.0, 200.0, datetime(2026, 1, 1, 12, 0, 0)),
        Snap("2026-01-01", 1080.0, 200.0, datetime(2026, 1, 1, 18, 0, 0)),  # ← should survive
        Snap("2026-01-02", 1090.0, 200.0, datetime(2026, 1, 2, 9, 0, 0)),
    ]
    day_map = {}
    for s in raw:
        day = s.snapshot_date[:10]
        if day not in day_map or s.created_at > day_map[day].created_at:
            day_map[day] = s
    deduped = sorted(day_map.values(), key=lambda s: s.snapshot_date[:10])

    assert len(deduped) == 2
    assert deduped[0].total_value == 1080.0, "Should keep latest snapshot for 2026-01-01"


# ── Test 5: no data → graceful empty response ─────────────────────────────────

def test_empty_snapshots():
    result = _compute_twr([], [])
    assert result["twr_start_date"] is None
    assert result["series"] == []
    assert result["cumulative_return_pct"] is None


# ── Test 6: pure growth, no deposits → TWR equals simple return ───────────────

def test_pure_growth_no_deposits():
    snaps = [
        Snap("2026-01-01", 10000.0, 0.0),
        Snap("2026-01-02", 11000.0, 0.0),
        Snap("2026-01-03", 11550.0, 0.0),
    ]
    result = _compute_twr(snaps, [])
    # +10% then +5% → cumulative 1.10 × 1.05 − 1 = 15.5%
    assert abs(result["cumulative_return_pct"] - 15.5) < 0.01


if __name__ == "__main__":
    tests = [
        test_twr_worked_example,
        test_backfill_gap_excluded,
        test_backfill_gap_midseries,
        test_backfill_noncontiguous_starts_after_last,
        test_capital_increase_excluded_from_flow,
        test_snapshot_deduplication_keeps_latest,
        test_empty_snapshots,
        test_pure_growth_no_deposits,
    ]
    passed = failed = 0
    for t in tests:
        try:
            t()
            print(f"  PASS  {t.__name__}")
            passed += 1
        except Exception as e:
            print(f"  FAIL  {t.__name__}: {e}")
            failed += 1
    print(f"\n{passed} passed, {failed} failed")
    if failed:
        sys.exit(1)
