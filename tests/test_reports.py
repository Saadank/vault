"""
Tests for the Reports page payload (report_service.serialize_report).

Runnable with plain `python tests/test_reports.py` and discoverable by pytest.
"""

import json
import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.report_service import compute_daily_movers, compute_day_change, serialize_report


class H:
    def __init__(self, name, ticker, asset_type, quantity, current_price):
        self.name = name
        self.ticker = ticker
        self.asset_type = asset_type
        self.quantity = quantity
        self.current_price = current_price


FRIDAY = date(2026, 11, 6)   # Tadawul closed, US + crypto open


def _data():
    holdings = [
        H("Apple", "AAPL", "Stock", 10, 110.0),
        H("Aramco", "2222.SR", "Stock", 100, 27.0),
    ]
    movers = compute_daily_movers(FRIDAY, holdings, {"Apple": 100.0, "Aramco": 26.0})
    chg_sar, chg_pct = compute_day_change(movers, 1100.0 + 2700.0)
    rows = [
        {"name": h.name, "ticker": h.ticker, "asset_type": h.asset_type, "quantity": h.quantity,
         "avg_cost": 1.0, "current_price": h.current_price, "market_value": h.quantity * h.current_price,
         "unrealized_pnl": 0.0, "unrealized_pct": 0.0}
        for h in holdings
    ]
    return {
        "report_iso": FRIDAY.isoformat(), "report_weekday": "Friday",
        "total_value": 3800.0, "portfolio_value": 3800.0, "cash_balance": 0.0,
        "total_invested": 3800.0, "unrealized_pnl": 0.0, "unrealized_pct": 0.0,
        "realized_pnl": 0.0, "positions_count": 2,
        "day_change_sar": chg_sar, "day_change_pct": chg_pct, "movers_count": len(movers),
        "daily_movers": movers, "holding_rows": rows, "allocation": [],
        "total_return_sar": 0.0, "total_return_pct": 0.0, "peak_value": 3800.0,
        "current_drawdown_pct": 0.0, "best_month": ("2026-10", 1.5), "worst_month": None,
        "today_txs": [],
    }


def test_day_move_joined_onto_holdings():
    p = serialize_report(_data())
    by_name = {h["name"]: h for h in p["holdings"]}
    assert round(by_name["Apple"]["day_pct"], 2) == 10.0
    assert by_name["Apple"]["day_sar"] == 100.0
    assert by_name["Apple"]["prev_price"] == 100.0


def test_closed_market_holding_has_no_day_move():
    p = serialize_report(_data())
    aramco = next(h for h in p["holdings"] if h["name"] == "Aramco")
    assert aramco["day_pct"] is None and aramco["day_sar"] is None
    assert p["movers_count"] == 1


def test_payload_is_json_safe():
    p = serialize_report(_data())
    assert json.loads(json.dumps(p))["best_month"] == ["2026-10", 1.5]
    assert p["report_date"] == "2026-11-06"


if __name__ == "__main__":
    for fn in (test_day_move_joined_onto_holdings, test_closed_market_holding_has_no_day_move,
               test_payload_is_json_safe):
        fn()
        print(f"ok  {fn.__name__}")
