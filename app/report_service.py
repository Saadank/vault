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
from xml.sax.saxutils import escape as _xesc
from datetime import date, datetime
from zoneinfo import ZoneInfo

import resend

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    CondPageBreak,
    KeepTogether,
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

from app.trading_calendar import classify_market, is_trading_day

logger = logging.getLogger(__name__)


# ── Daily movers (pure, testable) ─────────────────────────────────────────────
def compute_daily_movers(report_date, holdings, prev_close_by_name):
    """Build the "Today's Movers" rows for ``report_date``.

    Parameters
    ----------
    report_date : datetime.date
        The trading date the report is generated for.
    holdings : iterable
        Live holdings; each must expose ``name``, ``ticker``, ``asset_type``,
        ``quantity`` and ``current_price``.
    prev_close_by_name : dict[str, float]
        Map of holding name → the official close on the most recent *trading*
        day strictly before ``report_date`` (i.e. the stored prior close — never
        a live "previous close" quote re-fetched at run time).

    Rules
    -----
    * ``prev_price`` is the stored prior-trading-day close (the baseline).
    * ``curr_price`` is the holding's current price (same source as the
      position table).
    * A holding is **included only if its market actually traded on
      ``report_date``**. Closed-market assets (e.g. Tadawul on a Friday) are
      excluded entirely — they contribute 0% / 0 impact.
    """
    movers = []
    for h in holdings:
        market = classify_market(getattr(h, "asset_type", None), getattr(h, "ticker", None))
        if not is_trading_day(market, report_date):
            continue  # market closed on report_date → 0% / excluded
        prev = prev_close_by_name.get(h.name)
        if not prev or prev <= 0:
            continue
        curr = h.current_price
        movers.append({
            "name": h.name,
            "prev_price": prev,
            "curr_price": curr,
            "daily_pct": (curr - prev) / prev * 100,
            "daily_sar": (curr - prev) * h.quantity,
        })
    movers.sort(key=lambda x: abs(x["daily_pct"]), reverse=True)
    return movers


def compute_day_change(movers, portfolio_value):
    """Overall portfolio move *today*, derived from the same movers rows.

    Returns ``(change_sar, change_pct)``.

    * ``change_sar`` is the sum of every holding's price impact — holdings whose
      market was closed contribute nothing (they are already excluded upstream),
      and positions opened today have no prior close so they cannot show a
      phantom gain.
    * ``change_pct`` is measured against yesterday's implied market value
      (``portfolio_value - change_sar``), so deposits, withdrawals and new buys
      made today do not distort it.
    """
    change_sar = sum(m["daily_sar"] for m in movers)
    baseline = portfolio_value - change_sar
    change_pct = (change_sar / baseline * 100) if baseline > 0 else 0.0
    return change_sar, change_pct

# ── Design tokens ─────────────────────────────────────────────────────────────
INK        = colors.HexColor("#0b1220")   # primary text
NAVY       = colors.HexColor("#111c33")   # masthead
NAVY_LIGHT = colors.HexColor("#33415c")   # allocation bars
SLATE      = colors.HexColor("#5a677d")   # secondary text
STEEL      = colors.HexColor("#a7b3c7")   # on-navy secondary text
MUTED      = colors.HexColor("#8a97ac")   # labels / column heads
GOLD       = colors.HexColor("#c9a227")   # accent rule
GREEN      = colors.HexColor("#14805e")
RED        = colors.HexColor("#c2392b")
GREEN_BG   = colors.HexColor("#e8f5ef")   # positive tint
RED_BG     = colors.HexColor("#fceceb")   # negative tint
SOFT       = colors.HexColor("#f6f8fb")   # neutral fill
HAIRLINE   = colors.HexColor("#e6eaf1")   # row rules
WHITE      = colors.white

GRAY       = MUTED                        # neutral / zero-value text


# ── Helpers ───────────────────────────────────────────────────────────────────
def _c(val: float):
    """Return GREEN/RED/GRAY based on sign."""
    return GREEN if val > 0 else (RED if val < 0 else GRAY)


def _style(name, **kw):
    return ParagraphStyle(name, **kw)


def _px(text, style):
    """Paragraph with the text XML-escaped.

    ReportLab parses cell paragraphs as mini-XML, so a raw "&" in a label
    ("P&L") or an asset name ("S&P 500") swallows the following characters.
    """
    return Paragraph(_xesc(str(text)), style)


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

    # Daily movers — baseline is the stored close on the most recent TRADING
    # day strictly before today, NOT a re-fetched live "previous close".
    # Closed-market assets are excluded by compute_daily_movers().
    report_dt = date.today()
    today_str = report_dt.strftime("%Y-%m-%d")
    ps_res = await db.execute(
        select(HoldingSnapshot)
        .where(
            HoldingSnapshot.user_id == user_id,
            HoldingSnapshot.snapshot_date < today_str,
        )
        .order_by(HoldingSnapshot.snapshot_date)
    )
    # Ascending date order → the last row written per name is its most recent
    # prior close (this naturally carries the last close forward across gaps,
    # weekends and holidays).
    prev_close_by_name: dict[str, float] = {}
    for r in ps_res.scalars().all():
        prev_close_by_name[r.name] = r.current_price

    daily_movers = compute_daily_movers(report_dt, holdings, prev_close_by_name)
    day_change_sar, day_change_pct = compute_day_change(daily_movers, port_val)

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
        "report_weekday":  date.today().strftime("%A"),
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
        "day_change_sar":  day_change_sar,
        "day_change_pct":  day_change_pct,
        "movers_count":    len(daily_movers),
        "total_return_sar":    tr_sar,
        "total_return_pct":    tr_pct,
        "peak_value":          peak_val,
        "current_drawdown_pct": drawdown,
        "best_month":          best_month,
        "worst_month":         worst_month,
        "recent_txs":          recent_txs,
    }


# ── PDF builder ───────────────────────────────────────────────────────────────
def _page_furniture(canvas, doc):
    """Footer rule, disclaimer and page number — drawn on every page."""
    canvas.saveState()
    y = 12 * mm
    canvas.setStrokeColor(HAIRLINE)
    canvas.setLineWidth(0.5)
    canvas.line(15 * mm, y + 6, A4[0] - 15 * mm, y + 6)
    canvas.setFont("Helvetica", 6.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(15 * mm, y,
                      "VAULT Portfolio Manager  ·  Values in SAR unless noted  ·  Informational only")
    canvas.drawRightString(A4[0] - 15 * mm, y, f"Page {canvas.getPageNumber()}")
    canvas.restoreState()


def _build_pdf(data: dict) -> bytes:
    buf = io.BytesIO()
    W   = A4[0] - 30 * mm   # usable width

    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=15 * mm, rightMargin=15 * mm,
        topMargin=14 * mm,  bottomMargin=20 * mm,
        title=f"VAULT Portfolio Report — {data['report_date']}",
        author="VAULT Portfolio Manager",
    )

    # ── Type scale ────────────────────────────────────────────────────────────
    WORD   = _style("word",   fontSize=19,  textColor=WHITE, fontName="Helvetica-Bold", leading=21)
    KICKER = _style("kicker", fontSize=7,   textColor=GOLD,  fontName="Helvetica", leading=13)
    DATE_R = _style("dater",  fontSize=9.5, textColor=WHITE, fontName="Helvetica-Bold",
                    alignment=TA_RIGHT, leading=13)
    META_R = _style("metar",  fontSize=7.5, textColor=STEEL, fontName="Helvetica",
                    alignment=TA_RIGHT, leading=11)

    LBL    = _style("lbl",    fontSize=6.5, textColor=MUTED, fontName="Helvetica", leading=9)
    LBL_R  = _style("lblr",   fontSize=6.5, textColor=MUTED, fontName="Helvetica", leading=9,
                    alignment=TA_RIGHT)
    BIG    = _style("big",    fontSize=23,  textColor=INK,   fontName="Helvetica-Bold", leading=26)
    SUBTLE = _style("subtle", fontSize=7.5, textColor=SLATE, fontName="Helvetica", leading=11)
    SUB_R  = _style("subr",   fontSize=7.5, textColor=SLATE, fontName="Helvetica", leading=11,
                    alignment=TA_RIGHT)

    SEC    = _style("sec",    fontSize=10,  textColor=INK,   fontName="Helvetica-Bold", leading=12)
    SEC_R  = _style("secr",   fontSize=7.5, textColor=MUTED, fontName="Helvetica", leading=12,
                    alignment=TA_RIGHT)

    NAME_B = _style("nb",     fontSize=8.5, textColor=INK,   fontName="Helvetica-Bold", leading=10.5)
    NAME_N = _style("nn",     fontSize=8.5, textColor=INK,   fontName="Helvetica", leading=10.5)
    TAG    = _style("tag",    fontSize=6.5, textColor=MUTED, fontName="Helvetica", leading=9)
    TH     = _style("th",     fontSize=6.5, textColor=MUTED, fontName="Helvetica", leading=9)

    story = []

    # ── Masthead ──────────────────────────────────────────────────────────────
    user_name = data["user"].full_name or data["user"].username
    mast = Table(
        [[
            [Paragraph("VAULT", WORD), Paragraph("DAILY PORTFOLIO REPORT", KICKER)],
            [Paragraph(data["report_weekday"], DATE_R),
             Paragraph(f"{data['report_date']}<br/>{_xesc(user_name)}", META_R)],
        ]],
        colWidths=[W * 0.55, W * 0.45],
    )
    mast.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), NAVY),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 14),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 14),
        ("TOPPADDING",    (0, 0), (-1, -1), 13),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 13),
        ("LINEBELOW",     (0, 0), (-1, -1), 2, GOLD),
    ]))
    story.append(mast)

    # ── Headline: total value + today's change ────────────────────────────────
    chg_sar = data["day_change_sar"]
    chg_pct = data["day_change_pct"]
    traded  = data["movers_count"]

    if traded == 0:
        chg_tint, chg_col = SOFT, SLATE
        chg_head = "Markets closed"
        chg_note = "no position traded today"
    else:
        chg_tint = GREEN_BG if chg_sar > 0 else (RED_BG if chg_sar < 0 else SOFT)
        chg_col  = _c(chg_sar)
        chg_head = f"{chg_sar:+,.2f} SAR"
        plural   = "s" if traded != 1 else ""
        chg_note = f"{chg_pct:+.2f}%  ·  {traded} position{plural} traded"

    CHG = _style("chg", fontSize=19, textColor=chg_col, fontName="Helvetica-Bold",
                 leading=22, alignment=TA_RIGHT)

    head = Table(
        [[
            [Paragraph("TOTAL PORTFOLIO VALUE", LBL),
             Spacer(1, 3),
             Paragraph(f"{data['total_value']:,.2f} <font size='10' color='#8A97AC'>SAR</font>", BIG),
             Spacer(1, 2),
             Paragraph(f"{data['portfolio_value']:,.2f} at market  +  "
                       f"{data['cash_balance']:,.2f} cash", SUBTLE)],
            [Paragraph("CHANGE TODAY", LBL_R),
             Spacer(1, 6),
             Paragraph(chg_head, CHG),
             Spacer(1, 3),
             Paragraph(chg_note, SUB_R),
             Paragraph("vs previous close", SUB_R)],
        ]],
        colWidths=[W * 0.58, W * 0.42],
    )
    head.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (0, 0), SOFT),
        ("BACKGROUND",    (1, 0), (1, 0), chg_tint),
        ("LINEAFTER",     (0, 0), (0, 0), 3, WHITE),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 14),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 14),
        ("TOPPADDING",    (0, 0), (-1, -1), 13),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 13),
    ]))
    story.append(head)
    story.append(Spacer(1, 3))

    # ── KPI strip ─────────────────────────────────────────────────────────────
    kpis = [
        ("INVESTED",       f"{data['total_invested']:,.2f}",  INK),
        ("UNREALIZED P&L", f"{data['unrealized_pnl']:+,.2f}", _c(data["unrealized_pnl"])),
        ("RETURN",         f"{data['unrealized_pct']:+.2f}%", _c(data["unrealized_pnl"])),
        ("REALIZED P&L",   f"{data['realized_pnl']:+,.2f}",   _c(data["realized_pnl"])),
        ("POSITIONS",      f"{data['positions_count']}",      INK),
    ]
    kpi_rows = [
        [_px(lbl, LBL) for lbl, _v, _col in kpis],
        [_px(val, _style(f"kv{i}", fontSize=11, fontName="Helvetica-Bold",
                               leading=13, textColor=col))
         for i, (_lbl, val, col) in enumerate(kpis)],
    ]
    kpi_t = Table(kpi_rows, colWidths=[W / 5] * 5)
    kpi_t.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), SOFT),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 12),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
        ("TOPPADDING",    (0, 0), (-1, 0), 11),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 2),
        ("TOPPADDING",    (0, 1), (-1, 1), 0),
        ("BOTTOMPADDING", (0, 1), (-1, 1), 11),
        ("LINEAFTER",     (0, 0), (-2, -1), 3, WHITE),
    ]))
    story.append(kpi_t)

    # ── Section + table helpers ───────────────────────────────────────────────
    def section(title, note=None, space=9 * mm):
        # Never strand a section heading at the foot of a page.
        story.append(CondPageBreak(34 * mm))
        story.append(Spacer(1, space))
        if note:
            t = Table([[_px(title, SEC), _px(note, SEC_R)]],
                      colWidths=[W * 0.55, W * 0.45])
        else:
            t = Table([[_px(title, SEC)]], colWidths=[W])
        t.setStyle(TableStyle([
            ("VALIGN",        (0, 0), (-1, -1), "BOTTOM"),
            ("LEFTPADDING",   (0, 0), (-1, -1), 0),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
            ("TOPPADDING",    (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LINEBELOW",     (0, 0), (-1, -1), 1, INK),
        ]))
        story.append(t)
        story.append(Spacer(1, 2))

    def ruled(rows, widths, aligns, cell_colors=None, pad=6.5, size=8.5):
        """Hairline-ruled table: no vertical grid, underlined header, flush edges."""
        last = len(rows[0]) - 1
        t = Table(rows, colWidths=widths, repeatRows=1)
        ts = TableStyle([
            ("FONTNAME",      (0, 0), (-1, -1), "Helvetica"),
            ("FONTSIZE",      (0, 1), (-1, -1), size),
            ("TEXTCOLOR",     (0, 1), (-1, -1), INK),
            ("FONTSIZE",      (0, 0), (-1, 0), 6.5),
            ("TEXTCOLOR",     (0, 0), (-1, 0), MUTED),
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING",   (0, 0), (-1, -1), 7),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 7),
            ("LEFTPADDING",   (0, 0), (0, -1), 0),
            ("RIGHTPADDING",  (last, 0), (last, -1), 0),
            ("TOPPADDING",    (0, 0), (-1, -1), pad),
            ("BOTTOMPADDING", (0, 0), (-1, -1), pad),
            ("TOPPADDING",    (0, 0), (-1, 0), 0),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 5),
            ("LINEBELOW",     (0, 0), (-1, 0), 0.9, INK),
            ("LINEBELOW",     (0, 1), (-1, -1), 0.4, HAIRLINE),
        ])
        for i, a in enumerate(aligns):
            ts.add("ALIGN", (i, 0), (i, -1), a)
        for coord, color in (cell_colors or []):
            ts.add("TEXTCOLOR", coord, coord, color)
        t.setStyle(ts)
        return t

    def bar(pct, width):
        """Slim proportional bar used in the allocation table."""
        fill = max(width * min(pct, 100.0) / 100.0, 0.8)
        b = Table([[""]], colWidths=[fill], rowHeights=[5])
        b.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, -1), NAVY_LIGHT),
            ("LEFTPADDING",   (0, 0), (-1, -1), 0),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
            ("TOPPADDING",    (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ]))
        return b

    # ── Today's movers ────────────────────────────────────────────────────────
    if data["daily_movers"]:
        top8 = data["daily_movers"][:8]
        section("Today's Movers", "vs previous close  ·  closed markets excluded")
        rows = [[_px("ASSET", TH), "PREV", "CURRENT", "CHANGE", "IMPACT (SAR)"]]
        cc   = []
        for i, m in enumerate(top8, 1):
            rows.append([
                _px(m["name"], NAME_B),
                f"{m['prev_price']:,.4f}".rstrip("0").rstrip("."),
                f"{m['curr_price']:,.4f}".rstrip("0").rstrip("."),
                f"{m['daily_pct']:+.2f}%",
                f"{m['daily_sar']:+,.2f}",
            ])
            col = _c(m["daily_pct"])
            cc += [((3, i), col), ((4, i), col)]
        widths = [W * 0.34, W * 0.14, W * 0.14, W * 0.15, W * 0.23]
        story.append(KeepTogether(ruled(rows, widths,
                                  ["LEFT", "RIGHT", "RIGHT", "RIGHT", "RIGHT"], cc)))
        if len(data["daily_movers"]) > 8:
            story.append(Spacer(1, 4))
            story.append(Paragraph(
                f"and {len(data['daily_movers']) - 8} more that moved today", SUBTLE))

    # ── Best & worst holdings ────────────────────────────────────────────────
    sorted_by_pct = sorted(data["holding_rows"], key=lambda x: x["unrealized_pct"], reverse=True)
    gainers = [h for h in sorted_by_pct if h["unrealized_pct"] > 0][:5]
    losers  = [h for h in reversed(sorted_by_pct) if h["unrealized_pct"] < 0][:5]

    if gainers or losers:
        section("Best & Worst Holdings", "unrealized, since purchase")
        rows = [[_px("LEADERS", TH), "RETURN", "P&L", "",
                 _px("LAGGARDS", TH), "RETURN", "P&L"]]
        cc   = []
        for i in range(max(len(gainers), len(losers))):
            row = []
            if i < len(gainers):
                g = gainers[i]
                row += [_px(g["name"], NAME_B),
                        f"{g['unrealized_pct']:+.2f}%", f"{g['unrealized_pnl']:+,.2f}"]
                cc += [((1, i + 1), GREEN), ((2, i + 1), GREEN)]
            else:
                row += ["", "", ""]
            row.append("")
            if i < len(losers):
                l = losers[i]
                row += [_px(l["name"], NAME_B),
                        f"{l['unrealized_pct']:+.2f}%", f"{l['unrealized_pnl']:+,.2f}"]
                cc += [((5, i + 1), RED), ((6, i + 1), RED)]
            else:
                row += ["", "", ""]
            rows.append(row)

        widths = [W * 0.21, W * 0.10, W * 0.145, W * 0.07, W * 0.21, W * 0.10, W * 0.145]
        gl = Table(rows, colWidths=widths, repeatRows=1)
        ts = TableStyle([
            ("FONTNAME",      (0, 0), (-1, -1), "Helvetica"),
            ("FONTSIZE",      (0, 1), (-1, -1), 8.5),
            ("FONTSIZE",      (0, 0), (-1, 0), 6.5),
            ("TEXTCOLOR",     (0, 0), (-1, 0), MUTED),
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING",   (0, 0), (-1, -1), 7),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 7),
            ("LEFTPADDING",   (0, 0), (0, -1), 0),
            ("RIGHTPADDING",  (2, 0), (2, -1), 0),
            ("LEFTPADDING",   (4, 0), (4, -1), 0),
            ("RIGHTPADDING",  (6, 0), (6, -1), 0),
            ("TOPPADDING",    (0, 0), (-1, -1), 6.5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6.5),
            ("TOPPADDING",    (0, 0), (-1, 0), 0),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 5),
            ("ALIGN",         (1, 0), (2, -1), "RIGHT"),
            ("ALIGN",         (5, 0), (6, -1), "RIGHT"),
            ("LINEBELOW",     (0, 0), (2, 0), 0.9, GREEN),
            ("LINEBELOW",     (4, 0), (6, 0), 0.9, RED),
        ])
        if gainers:
            ts.add("LINEBELOW", (0, 1), (2, len(gainers)), 0.4, HAIRLINE)
        if losers:
            ts.add("LINEBELOW", (4, 1), (6, len(losers)), 0.4, HAIRLINE)
        for coord, color in cc:
            ts.add("TEXTCOLOR", coord, coord, color)
        gl.setStyle(ts)
        story.append(KeepTogether(gl))

    # ── Open positions ────────────────────────────────────────────────────────
    section("Open Positions",
            f"{data['positions_count']} holdings  ·  sorted by unrealized P&L")
    rows = [[_px("ASSET", TH), "QTY", "AVG COST", "PRICE",
             "MARKET VALUE", "P&L", "RETURN"]]
    cc   = []
    for i, r in enumerate(data["holding_rows"], 1):
        qty_str = f"{r['quantity']:,.6f}".rstrip("0").rstrip(".")
        rows.append([
            [_px(r["name"], NAME_B),
             _px(r["asset_type"].upper(), TAG)],
            qty_str,
            f"{r['avg_cost']:,.2f}",
            f"{r['current_price']:,.2f}",
            f"{r['market_value']:,.2f}",
            f"{r['unrealized_pnl']:+,.2f}",
            f"{r['unrealized_pct']:+.2f}%",
        ])
        col = _c(r["unrealized_pnl"])
        cc += [((5, i), col), ((6, i), col)]

    total_row = len(rows)
    rows.append([_px("TOTAL", NAME_B), "", "",
                 "",
                 f"{data['portfolio_value']:,.2f}",
                 f"{data['unrealized_pnl']:+,.2f}",
                 f"{data['unrealized_pct']:+.2f}%"])
    cc += [((5, total_row), _c(data["unrealized_pnl"])),
           ((6, total_row), _c(data["unrealized_pnl"]))]

    widths = [W * 0.26, W * 0.10, W * 0.115, W * 0.105, W * 0.15, W * 0.145, W * 0.125]
    pos = ruled(rows, widths,
                ["LEFT", "RIGHT", "RIGHT", "RIGHT", "RIGHT", "RIGHT", "RIGHT"], cc, pad=6)
    pos.setStyle(TableStyle([
        ("FONTNAME",      (0, total_row), (-1, total_row), "Helvetica-Bold"),
        ("LINEABOVE",     (0, total_row), (-1, total_row), 0.9, INK),
        ("LINEBELOW",     (0, total_row), (-1, total_row), 0, WHITE),
        ("TOPPADDING",    (0, total_row), (-1, total_row), 8),
        ("BOTTOMPADDING", (0, total_row), (-1, total_row), 8),
    ]))
    story.append(pos)

    # ── Allocation ────────────────────────────────────────────────────────────
    if data["allocation"]:
        section("Asset Allocation")
        bar_w = W * 0.30
        rows = [[_px("ASSET TYPE", TH), "MARKET VALUE", "", "WEIGHT"]]
        for a in data["allocation"]:
            rows.append([
                _px(a["asset_type"].capitalize(), NAME_N),
                f"{a['value']:,.2f}",
                bar(a["pct"], bar_w),
                f"{a['pct']:.1f}%",
            ])
        story.append(KeepTogether(ruled(rows, [W * 0.28, W * 0.24, bar_w, W * 0.18],
                                  ["LEFT", "RIGHT", "LEFT", "RIGHT"])))

    # ── Performance ───────────────────────────────────────────────────────────
    section("Performance Overview", "since inception")
    best_str  = f"{data['best_month'][0]}   ({data['best_month'][1]:+.2f}%)"   if data["best_month"]  else "—"
    worst_str = f"{data['worst_month'][0]}   ({data['worst_month'][1]:+.2f}%)" if data["worst_month"] else "—"
    rows = [
        [_px("METRIC", TH), "VALUE"],
        ["Change today",     f"{chg_sar:+,.2f} SAR   ({chg_pct:+.2f}%)"],
        ["Total return",     f"{data['total_return_sar']:+,.2f} SAR   ({data['total_return_pct']:+.2f}%)"],
        ["All-time peak",    f"{data['peak_value']:,.2f} SAR"],
        ["Current drawdown", f"{data['current_drawdown_pct']:.2f}%"],
        ["Best month",       best_str],
        ["Worst month",      worst_str],
    ]
    cc = [
        ((1, 1), _c(chg_sar)),
        ((1, 2), _c(data["total_return_sar"])),
        ((1, 4), _c(-abs(data["current_drawdown_pct"]))),
    ]
    perf = ruled(rows, [W * 0.45, W * 0.55], ["LEFT", "RIGHT"], cc, pad=7)
    perf.setStyle(TableStyle([("FONTNAME", (0, 1), (0, -1), "Helvetica-Bold")]))
    story.append(KeepTogether(perf))

    # ── Recent transactions ───────────────────────────────────────────────────
    if data["recent_txs"]:
        section("Recent Transactions", "last 10")
        rows = [[_px("DATE", TH), "TYPE", _px("ASSET", TH),
                 "QTY", "PRICE", "TOTAL", "REALIZED P&L"]]
        cc   = []
        for i, t in enumerate(data["recent_txs"], 1):
            qty_s = f"{t.quantity:,.4f}".rstrip("0").rstrip(".") if t.quantity else "—"
            pnl_s = f"{t.realized_pnl:+,.2f}" if t.realized_pnl is not None else "—"
            rows.append([
                t.tx_date or (t.created_at.strftime("%Y-%m-%d") if t.created_at else "—"),
                t.tx_type.capitalize(),
                _px(t.asset_name or "—", NAME_N),
                qty_s,
                f"{t.price:,.2f}" if t.price else "—",
                f"{t.total:,.2f}",
                pnl_s,
            ])
            if t.tx_type == "BUY":
                cc.append(((1, i), GREEN))
            elif t.tx_type == "SELL":
                cc.append(((1, i), RED))
            if t.realized_pnl is not None:
                cc.append(((6, i), _c(t.realized_pnl)))
        widths = [W * 0.11, W * 0.08, W * 0.27, W * 0.09, W * 0.11, W * 0.155, W * 0.185]
        story.append(ruled(rows, widths,
                           ["LEFT", "LEFT", "LEFT", "RIGHT", "RIGHT", "RIGHT", "RIGHT"],
                           cc, pad=6, size=8))

    doc.build(story, onFirstPage=_page_furniture, onLaterPages=_page_furniture)
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

    user_name = data["user"].full_name or data["user"].username

    chg_sar = data["day_change_sar"]
    chg_pct = data["day_change_pct"]
    traded  = data["movers_count"]

    if traded == 0:
        chg_color, chg_tint = "#5a677d", "#f6f8fb"
        chg_text = "Markets closed"
        chg_note = "no position traded today"
    else:
        up = chg_sar >= 0
        chg_color = "#14805e" if up else "#c2392b"
        chg_tint  = "#e8f5ef" if up else "#fceceb"
        chg_text  = f"{chg_sar:+,.2f} SAR"
        chg_note  = f"{chg_pct:+.2f}% &middot; {traded} position(s) traded"

    pnl_color = "#14805e" if data["unrealized_pnl"] >= 0 else "#c2392b"

    def _row(label, value, color="#0b1220", last=False):
        border = "" if last else "border-bottom:1px solid #e6eaf1;"
        return (
            f'<tr>'
            f'<td style="padding:12px 16px;{border}font-size:13px;color:#5a677d;">{label}</td>'
            f'<td style="padding:12px 16px;{border}text-align:right;font-size:13px;'
            f'font-weight:bold;color:{color};">{value}</td>'
            f'</tr>'
        )

    rows_html = (
        _row("Total portfolio value", f"{data['total_value']:,.2f} SAR")
        + _row("Unrealized P&amp;L",
               f"{data['unrealized_pnl']:+,.2f} SAR ({data['unrealized_pct']:+.2f}%)", pnl_color)
        + _row("Realized P&amp;L", f"{data['realized_pnl']:+,.2f} SAR",
               "#14805e" if data["realized_pnl"] >= 0 else "#c2392b")
        + _row("Open positions", f"{data['positions_count']}")
        + _row("Cash balance", f"{data['cash_balance']:,.2f} SAR", last=True)
    )

    html_body = f"""
<html><body style="margin:0;padding:24px 12px;background:#eef1f6;">
 <div style="font-family:Helvetica,Arial,sans-serif;color:#0b1220;max-width:560px;margin:0 auto;">

  <div style="background:#111c33;padding:22px 24px;border-bottom:2px solid #c9a227;">
    <div style="color:#ffffff;font-size:22px;font-weight:bold;letter-spacing:3px;">VAULT</div>
    <div style="color:#c9a227;font-size:10px;letter-spacing:1.5px;margin-top:4px;">DAILY PORTFOLIO REPORT</div>
  </div>

  <div style="background:{chg_tint};padding:22px 24px;">
    <div style="font-size:10px;letter-spacing:1px;color:#8a97ac;">CHANGE TODAY</div>
    <div style="font-size:26px;font-weight:bold;color:{chg_color};margin-top:6px;">{chg_text}</div>
    <div style="font-size:12px;color:#5a677d;margin-top:4px;">{chg_note} &middot; vs previous close</div>
  </div>

  <div style="background:#ffffff;padding:24px;">
    <p style="margin:0 0 18px;font-size:14px;color:#5a677d;">
      {user_name}, here is where your portfolio stands on
      <strong style="color:#0b1220;">{data['report_date']}</strong>.
    </p>

    <table style="width:100%;border-collapse:collapse;border:1px solid #e6eaf1;">
      {rows_html}
    </table>

    <p style="color:#8a97ac;font-size:12px;margin:20px 0 0;line-height:1.6;">
      The full breakdown &mdash; movers, positions, allocation and recent
      transactions &mdash; is attached as a PDF.<br>
      Generated automatically by VAULT.
    </p>
  </div>
 </div>
</body></html>
"""

    await _send_email_async(data["user"].email, subject, html_body, pdf_bytes, filename)
