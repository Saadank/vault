"""
Daily portfolio report — PDF generation + email delivery.

Required environment variables:
  RESEND_API_KEY — Resend API key
  REPORT_FROM    — sender address (default: reports@yourdomain.com)
  REPORT_TZ      — IANA timezone string  (default: Asia/Riyadh)
"""

import asyncio
import base64
import io
import logging
import os
from collections import defaultdict
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import resend

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from sqlalchemy import func, select

from app.database import (
    CashBalance,
    Holding,
    HoldingSnapshot,
    PortfolioSnapshot,
    SessionLocal,
    Transaction,
    User,
)

logger = logging.getLogger(__name__)

# ── Design tokens ─────────────────────────────────────────────────────────────
NAVY       = colors.HexColor("#0f172a")
NAVY_LIGHT = colors.HexColor("#1e293b")
GOLD       = colors.HexColor("#f59e0b")
GREEN      = colors.HexColor("#16a34a")
RED        = colors.HexColor("#dc2626")
GRAY       = colors.HexColor("#94a3b8")
LIGHT_GRAY = colors.HexColor("#f1f5f9")
WHITE      = colors.white
BORDER     = colors.HexColor("#e2e8f0")


# ── Helpers ───────────────────────────────────────────────────────────────────
def _c(val: float):
    """Return GREEN/RED/GRAY based on sign."""
    return GREEN if val > 0 else (RED if val < 0 else GRAY)


def _style(name, **kw):
    return ParagraphStyle(name, **kw)


# ── Data collection ───────────────────────────────────────────────────────────
async def _collect(db, user_id: int) -> dict:
    # User
    u_res = await db.execute(select(User).where(User.id == user_id))
    user = u_res.scalar_one_or_none()

    # Holdings
    h_res = await db.execute(
        select(Holding)
        .where(Holding.user_id == user_id, Holding.quantity > 0)
        .order_by(Holding.created_at)
    )
    holdings = h_res.scalars().all()

    # Cash
    cb_res = await db.execute(select(CashBalance).where(CashBalance.user_id == user_id))
    cb = cb_res.scalar_one_or_none()
    cash = cb.balance if cb else 0.0

    # Summary figures
    port_val    = sum(h.quantity * h.current_price for h in holdings)
    invested    = sum(h.quantity * h.avg_cost      for h in holdings)
    unreal_pnl  = port_val - invested
    unreal_pct  = (unreal_pnl / invested * 100) if invested else 0.0
    total_val   = port_val + cash

    pnl_res = await db.execute(
        select(func.sum(Transaction.realized_pnl)).where(
            Transaction.user_id == user_id,
            Transaction.tx_type == "SELL",
            Transaction.realized_pnl.is_not(None),
        )
    )
    realized_pnl = pnl_res.scalar() or 0.0

    # Per-holding rows sorted by unrealized P&L descending
    holding_rows = []
    for h in sorted(holdings, key=lambda x: x.quantity * (x.current_price - x.avg_cost), reverse=True):
        mv    = h.quantity * h.current_price
        cv    = h.quantity * h.avg_cost
        upnl  = mv - cv
        upct  = (upnl / cv * 100) if cv else 0.0
        holding_rows.append({
            "name": h.name,
            "asset_type": h.asset_type,
            "quantity": h.quantity,
            "avg_cost": h.avg_cost,
            "current_price": h.current_price,
            "market_value": mv,
            "unrealized_pnl": upnl,
            "unrealized_pct": upct,
        })

    # Asset allocation by type
    type_map: dict[str, float] = defaultdict(float)
    for h in holdings:
        type_map[h.asset_type] += h.quantity * h.current_price
    allocation = [
        {"asset_type": t, "value": v, "pct": v / port_val * 100 if port_val else 0}
        for t, v in sorted(type_map.items(), key=lambda x: x[1], reverse=True)
    ]

    # Daily movers: yesterday's holding_snapshot vs current prices
    yesterday = (date.today() - timedelta(days=1)).strftime("%Y-%m-%d")
    ys_res = await db.execute(
        select(HoldingSnapshot).where(
            HoldingSnapshot.user_id == user_id,
            HoldingSnapshot.snapshot_date == yesterday,
        )
    )
    ys_map = {r.name: r for r in ys_res.scalars().all()}

    daily_movers = []
    for h in holdings:
        if h.name in ys_map:
            prev = ys_map[h.name].current_price
            if prev and prev > 0:
                d_pct = (h.current_price - prev) / prev * 100
                d_sar = (h.current_price - prev) * h.quantity
                daily_movers.append({
                    "name": h.name,
                    "prev_price": prev,
                    "curr_price": h.current_price,
                    "daily_pct": d_pct,
                    "daily_sar": d_sar,
                })
    daily_movers.sort(key=lambda x: abs(x["daily_pct"]), reverse=True)

    # Portfolio snapshots (daily only) for performance metrics
    sp_res = await db.execute(
        select(PortfolioSnapshot)
        .where(
            PortfolioSnapshot.user_id == user_id,
            func.length(PortfolioSnapshot.snapshot_date) == 10,
        )
        .order_by(PortfolioSnapshot.snapshot_date)
    )
    snaps = sp_res.scalars().all()

    first_val   = snaps[0].total_value if snaps else None
    peak_val    = max((s.total_value for s in snaps), default=0.0)
    drawdown    = (total_val - peak_val) / peak_val * 100 if peak_val else 0.0
    tr_sar      = total_val - first_val if first_val else 0.0
    tr_pct      = (tr_sar / first_val * 100) if first_val and first_val > 0 else 0.0

    monthly: dict[str, float] = {}
    for s in snaps:
        monthly[s.snapshot_date[:7]] = s.total_value
    sm = sorted(monthly)
    best_month = worst_month = None
    if len(sm) >= 2:
        rets = []
        for i in range(1, len(sm)):
            p, c = monthly[sm[i - 1]], monthly[sm[i]]
            if p > 0:
                rets.append((sm[i], round((c - p) / p * 100, 2)))
        if rets:
            best_month  = max(rets, key=lambda x: x[1])
            worst_month = min(rets, key=lambda x: x[1])

    # Last 10 transactions
    tx_res = await db.execute(
        select(Transaction)
        .where(Transaction.user_id == user_id)
        .order_by(Transaction.created_at.desc())
        .limit(10)
    )
    recent_txs = tx_res.scalars().all()

    return {
        "user":            user,
        "report_date":     date.today().strftime("%B %d, %Y"),
        "total_value":     total_val,
        "portfolio_value": port_val,
        "total_invested":  invested,
        "unrealized_pnl":  unreal_pnl,
        "unrealized_pct":  unreal_pct,
        "realized_pnl":    realized_pnl,
        "cash_balance":    cash,
        "positions_count": len(holdings),
        "holding_rows":    holding_rows,
        "allocation":      allocation,
        "daily_movers":    daily_movers,
        "total_return_sar":    tr_sar,
        "total_return_pct":    tr_pct,
        "peak_value":          peak_val,
        "current_drawdown_pct": drawdown,
        "best_month":          best_month,
        "worst_month":         worst_month,
        "recent_txs":          recent_txs,
    }


# ── PDF builder ───────────────────────────────────────────────────────────────
def _build_pdf(data: dict) -> bytes:
    buf = io.BytesIO()
    W   = A4[0] - 30 * mm   # usable width

    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=15 * mm, rightMargin=15 * mm,
        topMargin=15 * mm,  bottomMargin=15 * mm,
        title=f"VAULT Portfolio Report — {data['report_date']}",
    )

    # Shared styles
    SEC      = _style("sec",    fontSize=12, textColor=NAVY,  fontName="Helvetica-Bold", spaceBefore=8, spaceAfter=5)
    FOOT     = _style("foot",   fontSize=7,  textColor=GRAY,  fontName="Helvetica", alignment=TA_CENTER)
    HDR1     = _style("hdr1",   fontSize=22, textColor=WHITE, fontName="Helvetica-Bold")
    HDR2     = _style("hdr2",   fontSize=11, textColor=WHITE, fontName="Helvetica-Bold", alignment=TA_RIGHT)
    SUB      = _style("sub",    fontSize=10, textColor=GOLD,  fontName="Helvetica")
    # Cell styles for long names — Paragraph wraps; plain strings clip
    NAME_B   = _style("nb",  fontSize=8,   textColor=NAVY, fontName="Helvetica-Bold",   leading=10)
    NAME_N   = _style("nn",  fontSize=8.5, textColor=NAVY, fontName="Helvetica",        leading=10)
    NAME_HDR = _style("nh",  fontSize=7.5, textColor=GRAY, fontName="Helvetica")

    def _tbl(rows, widths, header_rows=1, row_colors=None):
        """Build a styled table with standard theme."""
        n = len(rows)
        t = Table(rows, colWidths=widths, repeatRows=header_rows)
        ts = TableStyle([
            # Header row
            ("BACKGROUND", (0, 0), (-1, header_rows - 1), NAVY),
            ("TEXTCOLOR",  (0, 0), (-1, header_rows - 1), GRAY),
            ("FONTNAME",   (0, 0), (-1, header_rows - 1), "Helvetica"),
            ("FONTSIZE",   (0, 0), (-1, header_rows - 1), 7.5),
            # Body
            ("FONTNAME",   (0, header_rows), (-1, -1), "Helvetica"),
            ("FONTSIZE",   (0, header_rows), (-1, -1), 8.5),
            ("VALIGN",     (0, 0), (-1, -1), "MIDDLE"),
            ("PADDING",    (0, 0), (-1, -1), 6),
            ("GRID",       (0, 0), (-1, -1), 0.4, BORDER),
        ])
        # Zebra rows
        for i in range(header_rows, n):
            bg = WHITE if i % 2 == 0 else LIGHT_GRAY
            ts.add("BACKGROUND", (0, i), (-1, i), bg)
        if row_colors:
            for coord, color in row_colors:
                ts.add("TEXTCOLOR", coord, coord, color)
        t.setStyle(ts)
        return t

    story = []

    # ── Header banner ─────────────────────────────────────────────────────────
    user_name = data["user"].full_name or data["user"].username
    h_data = [[Paragraph("VAULT", HDR1),
               Paragraph(f"Portfolio Report<br/>"
                         f"<font size='9' color='#94a3b8'>{data['report_date']}</font>", HDR2)]]
    h_tbl = Table(h_data, colWidths=[W * 0.5, W * 0.5])
    h_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), NAVY),
        ("PADDING",    (0, 0), (-1, -1), 12),
        ("VALIGN",     (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(h_tbl)

    sub_tbl = Table([[Paragraph(f"Prepared for {user_name}", SUB)]], colWidths=[W])
    sub_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), NAVY_LIGHT),
        ("PADDING",    (0, 0), (-1, -1), 8),
    ]))
    story.append(sub_tbl)
    story.append(Spacer(1, 6 * mm))

    # ── Portfolio summary KPIs ────────────────────────────────────────────────
    story.append(Paragraph("Portfolio Summary", SEC))

    kpi_vals = [
        f"{data['total_value']:,.2f} SAR",
        f"{data['total_invested']:,.2f} SAR",
        f"{data['unrealized_pnl']:+,.2f} SAR\n({data['unrealized_pct']:+.2f}%)",
        f"{data['realized_pnl']:+,.2f} SAR",
        f"{data['cash_balance']:,.2f} SAR",
    ]
    kpi_rows = [
        ["Total Value", "Invested", "Unrealized P&L", "Realized P&L", "Cash"],
        kpi_vals,
    ]
    kpi_ts = TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR",  (0, 0), (-1, 0), GRAY),
        ("FONTNAME",   (0, 0), (-1, 0), "Helvetica"),
        ("FONTSIZE",   (0, 0), (-1, 0), 7.5),
        ("BACKGROUND", (0, 1), (-1, 1), LIGHT_GRAY),
        ("FONTNAME",   (0, 1), (-1, 1), "Helvetica-Bold"),
        ("FONTSIZE",   (0, 1), (-1, 1), 11),
        ("ALIGN",      (0, 0), (-1, -1), "CENTER"),
        ("VALIGN",     (0, 0), (-1, -1), "MIDDLE"),
        ("PADDING",    (0, 0), (-1, -1), 10),
        ("GRID",       (0, 0), (-1, -1), 0.4, BORDER),
        ("TEXTCOLOR",  (2, 1), (2, 1), _c(data["unrealized_pnl"])),
        ("TEXTCOLOR",  (3, 1), (3, 1), _c(data["realized_pnl"])),
    ])
    kpi_t = Table(kpi_rows, colWidths=[W / 5] * 5)
    kpi_t.setStyle(kpi_ts)
    story.append(kpi_t)
    story.append(Spacer(1, 6 * mm))

    # ── Daily movers ──────────────────────────────────────────────────────────
    if data["daily_movers"]:
        story.append(Paragraph("Today's Movers (vs Yesterday's Close)", SEC))
        top8 = data["daily_movers"][:8]
        mv_rows = [[Paragraph("Asset", NAME_HDR), "Prev Price", "Curr Price", "Daily Chg %", "Portfolio Impact (SAR)"]]
        mv_rc   = []
        for i, m in enumerate(top8, 1):
            mv_rows.append([
                Paragraph(m["name"], NAME_B),
                f"{m['prev_price']:,.4f}",
                f"{m['curr_price']:,.4f}",
                f"{m['daily_pct']:+.2f}%",
                f"{m['daily_sar']:+,.2f}",
            ])
            c = _c(m["daily_pct"])
            mv_rc += [((3, i), c), ((4, i), c)]
        mv_cw = [W * 0.28, W * 0.15, W * 0.15, W * 0.18, W * 0.24]
        mv_ts = TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), NAVY_LIGHT),
            ("TEXTCOLOR",  (0, 0), (-1, 0), GRAY),
            ("FONTNAME",   (0, 0), (-1, 0), "Helvetica"),
            ("FONTSIZE",   (0, 0), (-1, 0), 7.5),
            ("FONTNAME",   (1, 1), (-1, -1), "Helvetica"),
            ("FONTSIZE",   (1, 1), (-1, -1), 8.5),
            ("ALIGN",      (1, 0), (-1, -1), "RIGHT"),
            ("ALIGN",      (0, 0), (0, -1), "LEFT"),
            ("VALIGN",     (0, 0), (-1, -1), "MIDDLE"),
            ("PADDING",    (0, 0), (-1, -1), 6),
            ("GRID",       (0, 0), (-1, -1), 0.4, BORDER),
        ])
        for i in range(1, len(mv_rows)):
            bg = WHITE if i % 2 == 1 else LIGHT_GRAY
            mv_ts.add("BACKGROUND", (0, i), (-1, i), bg)
        for coord, color in mv_rc:
            mv_ts.add("TEXTCOLOR", coord, coord, color)
        mv_t = Table(mv_rows, colWidths=mv_cw)
        mv_t.setStyle(mv_ts)
        story.append(mv_t)
        story.append(Spacer(1, 6 * mm))

    # ── Top gainers / losers (by overall unrealized P&L %) ───────────────────
    sorted_by_pct = sorted(data["holding_rows"], key=lambda x: x["unrealized_pct"], reverse=True)
    gainers = [h for h in sorted_by_pct if h["unrealized_pct"] > 0][:5]
    losers  = [h for h in reversed(sorted_by_pct) if h["unrealized_pct"] < 0][:5]

    if gainers or losers:
        story.append(Paragraph("Top Gainers & Losers (Overall Unrealized Return)", SEC))
        gl_rows = [[Paragraph("Asset", NAME_HDR), "Return %", "Unrealized P&L (SAR)", "", Paragraph("Asset", NAME_HDR), "Return %", "Unrealized P&L (SAR)"]]
        max_len = max(len(gainers), len(losers))
        gl_rc   = []
        for i in range(max_len):
            row = []
            if i < len(gainers):
                g = gainers[i]
                row += [Paragraph(g["name"], NAME_B), f"{g['unrealized_pct']:+.2f}%", f"{g['unrealized_pnl']:+,.2f}"]
                gl_rc += [((1, i + 1), GREEN), ((2, i + 1), GREEN)]
            else:
                row += ["", "", ""]
            row.append("")   # separator column
            if i < len(losers):
                l = losers[i]
                row += [Paragraph(l["name"], NAME_B), f"{l['unrealized_pct']:+.2f}%", f"{l['unrealized_pnl']:+,.2f}"]
                gl_rc += [((5, i + 1), RED), ((6, i + 1), RED)]
            else:
                row += ["", "", ""]
            gl_rows.append(row)

        gl_cw = [W * 0.22, W * 0.10, W * 0.15, W * 0.06, W * 0.22, W * 0.10, W * 0.15]
        gl_ts = TableStyle([
            ("BACKGROUND", (0, 0), (2, 0), colors.HexColor("#14532d")),
            ("BACKGROUND", (4, 0), (6, 0), colors.HexColor("#7f1d1d")),
            ("BACKGROUND", (3, 0), (3, -1), WHITE),
            ("TEXTCOLOR",  (0, 0), (2, 0), GRAY),
            ("TEXTCOLOR",  (4, 0), (6, 0), GRAY),
            ("FONTNAME",   (0, 0), (-1, 0), "Helvetica"),
            ("FONTSIZE",   (0, 0), (-1, 0), 7.5),
            ("FONTNAME",   (1, 1), (-1, -1), "Helvetica"),
            ("FONTSIZE",   (1, 1), (-1, -1), 8.5),
            ("ALIGN",      (1, 0), (2, -1), "RIGHT"),
            ("ALIGN",      (5, 0), (6, -1), "RIGHT"),
            ("ALIGN",      (0, 0), (0, -1), "LEFT"),
            ("ALIGN",      (4, 0), (4, -1), "LEFT"),
            ("VALIGN",     (0, 0), (-1, -1), "MIDDLE"),
            ("PADDING",    (0, 0), (-1, -1), 6),
            ("GRID",       (0, 0), (2, -1), 0.4, BORDER),
            ("GRID",       (4, 0), (6, -1), 0.4, BORDER),
        ])
        for i in range(1, len(gl_rows)):
            bg = WHITE if i % 2 == 1 else LIGHT_GRAY
            gl_ts.add("BACKGROUND", (0, i), (2, i), bg)
            gl_ts.add("BACKGROUND", (4, i), (6, i), bg)
        for coord, color in gl_rc:
            gl_ts.add("TEXTCOLOR", coord, coord, color)
        gl_t = Table(gl_rows, colWidths=gl_cw)
        gl_t.setStyle(gl_ts)
        story.append(gl_t)
        story.append(Spacer(1, 6 * mm))

    # ── Open positions table ──────────────────────────────────────────────────
    story.append(Paragraph(f"Open Positions ({data['positions_count']})", SEC))
    hold_rows = [[Paragraph("Asset", NAME_HDR), "Type", "Qty", "Avg Cost", "Price", "Market Value", "P&L (SAR)", "Return %"]]
    hold_rc   = []
    for i, r in enumerate(data["holding_rows"], 1):
        qty_str = f"{r['quantity']:,.6f}".rstrip("0").rstrip(".")
        hold_rows.append([
            Paragraph(r["name"], NAME_B),
            r["asset_type"].capitalize(),
            qty_str,
            f"{r['avg_cost']:,.2f}",
            f"{r['current_price']:,.2f}",
            f"{r['market_value']:,.2f}",
            f"{r['unrealized_pnl']:+,.2f}",
            f"{r['unrealized_pct']:+.2f}%",
        ])
        c = _c(r["unrealized_pnl"])
        hold_rc += [((6, i), c), ((7, i), c)]
    hold_cw = [W * 0.22, W * 0.09, W * 0.08, W * 0.1, W * 0.1, W * 0.14, W * 0.14, W * 0.13]
    hold_ts = TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR",  (0, 0), (-1, 0), GRAY),
        ("FONTNAME",   (0, 0), (-1, 0), "Helvetica"),
        ("FONTSIZE",   (0, 0), (-1, 0), 7.5),
        ("FONTNAME",   (1, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE",   (1, 1), (-1, -1), 8),
        ("ALIGN",      (2, 0), (-1, -1), "RIGHT"),
        ("ALIGN",      (0, 0), (1, -1), "LEFT"),
        ("VALIGN",     (0, 0), (-1, -1), "MIDDLE"),
        ("PADDING",    (0, 0), (-1, -1), 5),
        ("GRID",       (0, 0), (-1, -1), 0.4, BORDER),
    ])
    for i in range(1, len(hold_rows)):
        hold_ts.add("BACKGROUND", (0, i), (-1, i), WHITE if i % 2 == 1 else LIGHT_GRAY)
    for coord, color in hold_rc:
        hold_ts.add("TEXTCOLOR", coord, coord, color)
    hold_t = Table(hold_rows, colWidths=hold_cw, repeatRows=1)
    hold_t.setStyle(hold_ts)
    story.append(hold_t)
    story.append(Spacer(1, 6 * mm))

    # ── Asset allocation ──────────────────────────────────────────────────────
    if data["allocation"]:
        story.append(Paragraph("Asset Allocation", SEC))
        alloc_rows = [["Asset Type", "Market Value (SAR)", "Portfolio Weight"]]
        for a in data["allocation"]:
            alloc_rows.append([
                a["asset_type"].capitalize(),
                f"{a['value']:,.2f}",
                f"{a['pct']:.1f}%",
            ])
        al_ts = TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), NAVY),
            ("TEXTCOLOR",  (0, 0), (-1, 0), GRAY),
            ("FONTNAME",   (0, 0), (-1, 0), "Helvetica"),
            ("FONTSIZE",   (0, 0), (-1, 0), 7.5),
            ("FONTNAME",   (0, 1), (-1, -1), "Helvetica"),
            ("FONTSIZE",   (0, 1), (-1, -1), 8.5),
            ("ALIGN",      (1, 0), (-1, -1), "RIGHT"),
            ("ALIGN",      (0, 0), (0, -1), "LEFT"),
            ("VALIGN",     (0, 0), (-1, -1), "MIDDLE"),
            ("PADDING",    (0, 0), (-1, -1), 7),
            ("GRID",       (0, 0), (-1, -1), 0.4, BORDER),
        ])
        for i in range(1, len(alloc_rows)):
            al_ts.add("BACKGROUND", (0, i), (-1, i), WHITE if i % 2 == 1 else LIGHT_GRAY)
        al_t = Table(alloc_rows, colWidths=[W * 0.4, W * 0.35, W * 0.25])
        al_t.setStyle(al_ts)
        story.append(al_t)
        story.append(Spacer(1, 6 * mm))

    # ── Performance overview ──────────────────────────────────────────────────
    story.append(Paragraph("Performance Overview", SEC))
    best_str  = f"{data['best_month'][0]} ({data['best_month'][1]:+.2f}%)"  if data["best_month"]  else "—"
    worst_str = f"{data['worst_month'][0]} ({data['worst_month'][1]:+.2f}%)" if data["worst_month"] else "—"

    perf_rows = [
        ["Metric", "Value"],
        ["Total Return",      f"{data['total_return_sar']:+,.2f} SAR  ({data['total_return_pct']:+.2f}%)"],
        ["All-Time Peak",     f"{data['peak_value']:,.2f} SAR"],
        ["Current Drawdown",  f"{data['current_drawdown_pct']:.2f}%"],
        ["Best Month",        best_str],
        ["Worst Month",       worst_str],
    ]
    perf_rc = [
        ((1, 1), _c(data["total_return_sar"])),
        ((1, 3), _c(-abs(data["current_drawdown_pct"]))),
    ]
    perf_ts = TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR",  (0, 0), (-1, 0), GRAY),
        ("FONTNAME",   (0, 0), (-1, 0), "Helvetica"),
        ("FONTSIZE",   (0, 0), (-1, 0), 7.5),
        ("FONTNAME",   (0, 1), (0, -1), "Helvetica-Bold"),
        ("FONTNAME",   (1, 1), (1, -1), "Helvetica"),
        ("FONTSIZE",   (0, 1), (-1, -1), 8.5),
        ("ALIGN",      (1, 0), (1, -1), "RIGHT"),
        ("ALIGN",      (0, 0), (0, -1), "LEFT"),
        ("VALIGN",     (0, 0), (-1, -1), "MIDDLE"),
        ("PADDING",    (0, 0), (-1, -1), 8),
        ("GRID",       (0, 0), (-1, -1), 0.4, BORDER),
    ])
    for i in range(1, len(perf_rows)):
        perf_ts.add("BACKGROUND", (0, i), (-1, i), WHITE if i % 2 == 1 else LIGHT_GRAY)
    for coord, color in perf_rc:
        perf_ts.add("TEXTCOLOR", coord, coord, color)
    perf_t = Table(perf_rows, colWidths=[W * 0.45, W * 0.55])
    perf_t.setStyle(perf_ts)
    story.append(perf_t)
    story.append(Spacer(1, 6 * mm))

    # ── Recent transactions ───────────────────────────────────────────────────
    if data["recent_txs"]:
        story.append(Paragraph("Recent Transactions (Last 10)", SEC))
        tx_rows = [["Date", "Type", Paragraph("Asset", NAME_HDR), "Qty", "Price", "Total (SAR)", "Realized P&L"]]
        tx_rc   = []
        for i, t in enumerate(data["recent_txs"], 1):
            qty_s = f"{t.quantity:,.4f}".rstrip("0").rstrip(".") if t.quantity else "—"
            pnl_s = f"{t.realized_pnl:+,.2f}" if t.realized_pnl is not None else "—"
            tx_rows.append([
                t.tx_date or (t.created_at.strftime("%Y-%m-%d") if t.created_at else "—"),
                t.tx_type,
                Paragraph(t.asset_name or "—", NAME_N),
                qty_s,
                f"{t.price:,.2f}" if t.price else "—",
                f"{t.total:,.2f}",
                pnl_s,
            ])
            if t.tx_type == "BUY":
                tx_rc.append(((1, i), GREEN))
            elif t.tx_type == "SELL":
                tx_rc.append(((1, i), RED))
            if t.realized_pnl is not None:
                tx_rc.append(((6, i), _c(t.realized_pnl)))
        tx_ts = TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), NAVY),
            ("TEXTCOLOR",  (0, 0), (-1, 0), GRAY),
            ("FONTNAME",   (0, 0), (-1, 0), "Helvetica"),
            ("FONTSIZE",   (0, 0), (-1, 0), 7.5),
            ("FONTNAME",   (0, 1), (2, -1), "Helvetica"),
            ("FONTSIZE",   (0, 1), (-1, -1), 8),
            ("ALIGN",      (3, 0), (-1, -1), "RIGHT"),
            ("ALIGN",      (0, 0), (2, -1), "LEFT"),
            ("VALIGN",     (0, 0), (-1, -1), "MIDDLE"),
            ("PADDING",    (0, 0), (-1, -1), 6),
            ("GRID",       (0, 0), (-1, -1), 0.4, BORDER),
        ])
        for i in range(1, len(tx_rows)):
            tx_ts.add("BACKGROUND", (0, i), (-1, i), WHITE if i % 2 == 1 else LIGHT_GRAY)
        for coord, color in tx_rc:
            tx_ts.add("TEXTCOLOR", coord, coord, color)
        tx_cw = [W * 0.10, W * 0.07, W * 0.28, W * 0.08, W * 0.11, W * 0.17, W * 0.19]
        tx_t = Table(tx_rows, colWidths=tx_cw, repeatRows=1)
        tx_t.setStyle(tx_ts)
        story.append(tx_t)

    # ── Footer ────────────────────────────────────────────────────────────────
    story.append(Spacer(1, 8 * mm))
    story.append(HRFlowable(width=W, color=BORDER))
    story.append(Spacer(1, 2 * mm))
    story.append(Paragraph(
        f"Generated by VAULT Portfolio Manager · {data['report_date']} · "
        "All values in Saudi Riyals (SAR) unless noted · For informational purposes only",
        FOOT,
    ))

    doc.build(story)
    buf.seek(0)
    return buf.read()


# ── Email ─────────────────────────────────────────────────────────────────────
def _send_email_sync(to_email: str, subject: str, html_body: str,
                     pdf_bytes: bytes, filename: str) -> None:
    api_key = os.getenv("RESEND_API_KEY", "")
    if not api_key:
        logger.warning("RESEND_API_KEY not configured — skipping email send")
        return

    resend.api_key = api_key
    from_addr = os.getenv("REPORT_FROM", "VAULT Reports <reports@vault.app>")

    resend.Emails.send({
        "from": from_addr,
        "to": [to_email],
        "subject": subject,
        "html": html_body,
        "attachments": [
            {
                "filename": filename,
                "content": list(pdf_bytes),
            }
        ],
    })

    logger.info(f"Portfolio report sent to {to_email}")


async def _send_email_async(to_email: str, subject: str, html_body: str,
                             pdf_bytes: bytes, filename: str) -> None:
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(
        None, _send_email_sync, to_email, subject, html_body, pdf_bytes, filename
    )


# ── Public entry point ────────────────────────────────────────────────────────
async def send_daily_report(user_id: int) -> None:
    """Collect data, render PDF, and email it to the user."""
    async with SessionLocal() as db:
        data = await _collect(db, user_id)

    if not data["user"]:
        logger.warning(f"User {user_id} not found — skipping report")
        return
    if not data["user"].email:
        logger.warning(f"User {user_id} has no email — skipping report")
        return

    pdf_bytes = _build_pdf(data)
    today_iso = date.today().strftime("%Y-%m-%d")
    filename  = f"vault_report_{today_iso}.pdf"
    subject   = f"VAULT Daily Report — {data['report_date']}"

    user_name  = data["user"].full_name or data["user"].username
    pnl_color  = "#16a34a" if data["unrealized_pnl"] >= 0 else "#dc2626"

    html_body = f"""
<html><body style="font-family:Arial,sans-serif;color:#0f172a;max-width:600px;margin:0 auto;">
  <div style="background:#0f172a;padding:20px;border-radius:8px 8px 0 0;">
    <h1 style="color:white;margin:0;font-size:22px;letter-spacing:2px;">VAULT</h1>
    <p style="color:#f59e0b;margin:4px 0 0;font-size:13px;">Daily Portfolio Report</p>
  </div>
  <div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;">
    <p style="margin:0 0 16px;">Hello <strong>{user_name}</strong>,</p>
    <p style="margin:0 0 16px;">Here is your portfolio snapshot for <strong>{data['report_date']}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <tr style="background:#0f172a;">
        <th style="padding:10px 12px;text-align:left;font-size:11px;color:#94a3b8;font-weight:normal;">Metric</th>
        <th style="padding:10px 12px;text-align:right;font-size:11px;color:#94a3b8;font-weight:normal;">Value</th>
      </tr>
      <tr style="background:white;">
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">Total Portfolio Value</td>
        <td style="padding:10px 12px;text-align:right;border-bottom:1px solid #e2e8f0;font-weight:bold;">{data['total_value']:,.2f} SAR</td>
      </tr>
      <tr style="background:#f8fafc;">
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">Unrealized P&amp;L</td>
        <td style="padding:10px 12px;text-align:right;border-bottom:1px solid #e2e8f0;font-weight:bold;color:{pnl_color};">{data['unrealized_pnl']:+,.2f} SAR ({data['unrealized_pct']:+.2f}%)</td>
      </tr>
      <tr style="background:white;">
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">Open Positions</td>
        <td style="padding:10px 12px;text-align:right;border-bottom:1px solid #e2e8f0;">{data['positions_count']}</td>
      </tr>
      <tr style="background:#f8fafc;">
        <td style="padding:10px 12px;">Cash Balance</td>
        <td style="padding:10px 12px;text-align:right;">{data['cash_balance']:,.2f} SAR</td>
      </tr>
    </table>
    <p style="color:#64748b;font-size:13px;margin:0;">
      The full detailed report is attached as a PDF.<br>
      <em>This report is generated automatically by VAULT.</em>
    </p>
  </div>
</body></html>
"""

    await _send_email_async(data["user"].email, subject, html_body, pdf_bytes, filename)
