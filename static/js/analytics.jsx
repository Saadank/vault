// Analytics screen — overview, true performance, allocation, P&L, activity, cashflow, scoreboard.

const Analytics = ({ data, onSendReport }) => {
  const { overview, allocation, pnl, monthlyTx, mostTraded, cashflow, scoreboard, performance, fmt, summary } = data;
  const [allocMode, setAllocMode] = React.useState("type");
  const [pnlSort, setPnlSort] = React.useState({ col: "total", dir: -1 });
  const [sbSort, setSbSort] = React.useState({ col: "total_pnl", dir: -1 });
  const [twrRange, setTwrRange] = React.useState("All");

  // Filter + rebase TWR series to the selected range window
  const TWR_RANGES = ["1W", "1M", "3M", "6M", "1Y", "All"];
  const TWR_DAYS   = { "1W": 7, "1M": 30, "3M": 90, "6M": 180, "1Y": 365 };

  const twrSeries = React.useMemo(() => {
    const src = (performance && performance.series) || [];
    if (!src.length) return src;
    let slice = src;
    if (twrRange !== "All") {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - TWR_DAYS[twrRange]);
      const cutStr = cutoff.toISOString().slice(0, 10);
      slice = src.filter(p => p.date >= cutStr);
      if (!slice.length) slice = src; // fallback: not enough history
    }
    // Rebase both indices to 100 at the first visible point
    const baseFace = slice[0].face_index;
    const baseTwr  = slice[0].twr_index;
    return slice.map(p => ({
      ...p,
      face_index_r: (p.face_index / baseFace) * 100,
      twr_index_r:  (p.twr_index  / baseTwr)  * 100,
    }));
  }, [performance, twrRange]);

  const mkToggle = (setFn) => (col) =>
    setFn(s => ({ col, dir: s.col === col ? s.dir * -1 : -1 }));

  const sortRows = (rows, { col, dir }) =>
    [...rows].sort((a, b) => {
      const va = a[col], vb = b[col];
      if (typeof va === "string") return dir * va.localeCompare(vb);
      return dir * ((va ?? 0) - (vb ?? 0));
    });

  const SortTh = ({ label, col, sortState, onToggle, cls = "" }) => (
    <th className={cls} onClick={() => onToggle(col)}
        style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>
      {label}
      <span style={{ marginLeft: 4, fontSize: 9, opacity: sortState.col === col ? 0.8 : 0.25 }}>
        {sortState.col === col ? (sortState.dir === -1 ? "▼" : "▲") : "⇅"}
      </span>
    </th>
  );

  const allocData = allocMode === "type" ? allocation.by_type : allocation.current;
  const allocLabel = allocMode === "type" ? "asset_type" : "name";

  return (
    <div className="col gap-32" style={{ padding: "24px 28px 40px", maxWidth: 1480, margin: "0 auto" }}>
      {/* Header */}
      <div className="row between" style={{ alignItems: "flex-start" }}>
        <div className="col gap-4">
          <div className="eyebrow">Analytics · All-time view</div>
          <h1 className="serif" style={{ fontSize: 34, lineHeight: 1 }}>The deeper layer.</h1>
          <div className="dim" style={{ fontSize: 13, maxWidth: 540, marginTop: 4 }}>
            Where your money has been, how it moved, and what it earned. Built from your daily snapshots.
          </div>
        </div>
        <div className="row gap-8">
          <button className="btn gold" onClick={onSendReport}>
            <Icon name="mail" size={14} /> Send full report
          </button>
        </div>
      </div>

      {/* Overview KPIs */}
      <Section eyebrow="Overview" title="Performance at a glance">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          <KPI
            label="Total Return"
            value={fmt.PCT(overview.total_return_pct, { sign: true })}
            accent="var(--gain)"
            sub={<><Delta value={overview.total_return_sar} suffix=" SAR" /></>}
            large
          />
          <KPI
            label="Peak Value"
            value={fmt.SAR(overview.peak_value, { decimals: 0 })}
            suffix="SAR"
            sub={<span className="dim" style={{ fontSize: 12 }}>Drawdown <Delta value={overview.current_drawdown_pct} suffix="%" /></span>}
            large
          />
          <KPI
            label="Best / Worst Month"
            value={
              <span>
                <span style={{ color: "var(--gain)" }}>+{overview.best_month.return_pct}%</span>
                <span className="dim" style={{ margin: "0 8px", fontFamily: "Geist", fontSize: 14 }}>·</span>
                <span style={{ color: "var(--loss)" }}>−{Math.abs(overview.worst_month.return_pct)}%</span>
              </span>
            }
            sub={
              <div className="row gap-12 dim" style={{ fontSize: 11.5 }}>
                <span className="mono">{overview.best_month.month}</span>
                <span>·</span>
                <span className="mono">{overview.worst_month.month}</span>
              </div>
            }
            large
          />
          <KPI
            label="Win Rate"
            value={fmt.PCT(overview.win_rate_pct, { sign: false })}
            sub={<span className="dim" style={{ fontSize: 12 }}>{pnl.summary.winning_sells} winning of {pnl.summary.total_sells} sells</span>}
            large
          />
        </div>
      </Section>

      {/* True Performance (TWR) */}
      {performance && (
        <Section
          eyebrow="True Performance"
          title="Return adjusted for deposits &amp; withdrawals"
          action={
            performance.twr_start_date && (
              <span className="dim mono" style={{ fontSize: 11 }}>
                index = 100 on {performance.twr_start_date}
                {performance.twr_start_reason && (
                  <span style={{ marginLeft: 8, color: "var(--gold)" }} title={performance.twr_start_reason}>⚠ data gap</span>
                )}
              </span>
            )
          }
        >
          {/* Four distinct metric KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 24 }}>
            <KPI
              label="True Return (TWR)"
              value={performance.twr_cumulative_return_pct !== null ? fmt.PCT(performance.twr_cumulative_return_pct, { sign: true }) : "—"}
              accent={performance.twr_cumulative_return_pct >= 0 ? "var(--gain)" : "var(--loss)"}
              sub={<span className="dim" style={{ fontSize: 11 }}>Each riyal in, adjusted for timing of deposits</span>}
              large
            />
            <KPI
              label="Unrealized P&L"
              value={performance.unrealized_pnl !== null ? fmt.SAR(performance.unrealized_pnl, { sign: true }) : "—"}
              accent={performance.unrealized_pnl >= 0 ? "var(--gain)" : "var(--loss)"}
              sub={<span className="dim" style={{ fontSize: 11 }}>Open positions: what you'd net selling today</span>}
            />
            <KPI
              label="Realized P&L"
              value={performance.realized_pnl !== null ? fmt.SAR(performance.realized_pnl, { sign: true }) : "—"}
              accent={performance.realized_pnl >= 0 ? "var(--gain)" : "var(--loss)"}
              sub={<span className="dim" style={{ fontSize: 11 }}>Closed trades: profit already banked</span>}
            />
            <KPI
              label="Net P&L (All Trades)"
              value={performance.net_pnl !== null ? fmt.SAR(performance.net_pnl, { sign: true }) : "—"}
              accent={performance.net_pnl >= 0 ? "var(--gain)" : "var(--loss)"}
              sub={<span className="dim" style={{ fontSize: 11 }}>Unrealized + realized · total SAR result</span>}
            />
          </div>

          {/* Range selector + chart */}
          {twrSeries.length > 1 && (() => {
            const rangeReturn = twrSeries[twrSeries.length - 1].twr_index_r - 100;
            const chartColor = rangeReturn >= 0 ? "var(--gain)" : "var(--loss)";
            return (
              <div>
                {/* Range buttons */}
                <div className="row between" style={{ marginBottom: 12, alignItems: "center" }}>
                  <span className="dim mono" style={{ fontSize: 11 }}>
                    {twrRange === "All"
                      ? `From ${performance.twr_start_date}`
                      : `Last ${twrRange} · rebased to 100`}
                    {" "}·{" "}
                    <span style={{ color: rangeReturn >= 0 ? "var(--gain)" : "var(--loss)", fontWeight: 600 }}>
                      {rangeReturn >= 0 ? "+" : ""}{rangeReturn.toFixed(2)}%
                    </span>
                  </span>
                  <div className="row gap-2" style={{ background: "var(--paper-2)", border: "1px solid var(--line)", borderRadius: 8, padding: 3 }}>
                    {TWR_RANGES.map(r => (
                      <button key={r} onClick={() => setTwrRange(r)}
                        style={{
                          padding: "5px 11px", fontSize: 12, borderRadius: 6, fontWeight: 500,
                          background: twrRange === r ? "var(--paper)" : "transparent",
                          color:      twrRange === r ? "var(--ink)"   : "var(--ink-3)",
                          boxShadow:  twrRange === r ? "0 1px 2px rgba(0,0,0,.06)" : "none",
                          border: "none", cursor: "pointer",
                        }}>
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
                <TwrChart
                  series={[
                    {
                      label: "Face Value (indexed)",
                      values: twrSeries.map(p => p.face_index_r),
                      color: "var(--muted)",
                      dash: true,
                    },
                    {
                      label: "True Performance (TWR)",
                      values: twrSeries.map(p => p.twr_index_r),
                      color: chartColor,
                    },
                  ]}
                  xLabels={twrSeries.map(p => p.date.slice(5))}
                  height={260}
                  yLabel="Index (start = 100)"
                />
              </div>
            );
          })()}
        </Section>
      )}

      {/* Allocation */}
      <Section eyebrow="Allocation"
               title="How wealth is distributed"
               action={
                 <div className="row" style={{ background: "var(--paper-2)", border: "1px solid var(--line)", borderRadius: 8, padding: 2 }}>
                   {["type", "holding"].map(m => (
                     <button key={m} onClick={() => setAllocMode(m)}
                             style={{
                               padding: "6px 12px", fontSize: 12, borderRadius: 6,
                               background: allocMode === m ? "var(--paper)" : "transparent",
                               color: allocMode === m ? "var(--ink)" : "var(--ink-3)",
                               boxShadow: allocMode === m ? "0 1px 2px rgba(0,0,0,.06)" : "none",
                               fontWeight: 500, textTransform: "capitalize",
                             }}>
                       By {m}
                     </button>
                   ))}
                 </div>
               }>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 16 }}>
          <div className="card" style={{ padding: 24 }}>
            <div className="row between">
              <div className="eyebrow">Current snapshot</div>
              <span className="mono dim" style={{ fontSize: 11 }}>{fmt.SAR(summary.portfolio_value, { decimals: 0 })} SAR</span>
            </div>
            <div className="row gap-24" style={{ marginTop: 16, alignItems: "center" }}>
              <div style={{ position: "relative" }}>
                <Donut data={allocData} size={200} thickness={26} />
                <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
                  <div className="col gap-2 center" style={{ textAlign: "center" }}>
                    <div className="serif" style={{ fontSize: 24, lineHeight: 1 }}>{allocData.length}</div>
                    <div className="eyebrow" style={{ fontSize: 9 }}>{allocMode === "type" ? "Asset classes" : "Positions"}</div>
                  </div>
                </div>
              </div>
              <div className="col gap-8 grow" style={{ minWidth: 0 }}>
                {allocData.map((d, i) => {
                  const palette = ["var(--accent)", "var(--ink)", "#7c3aed", "#0e7490", "#a16207", "#475569", "#be185d", "#1e40af"];
                  return (
                    <div key={i} className="row between" style={{ fontSize: 12.5 }}>
                      <div className="row gap-8" style={{ minWidth: 0 }}>
                        <div style={{ width: 10, height: 10, borderRadius: 3, background: palette[i % palette.length], flexShrink: 0 }} />
                        <span className="truncate">{d[allocLabel]}</span>
                      </div>
                      <div className="row gap-12 num" style={{ fontVariantNumeric: "tabular-nums" }}>
                        <span className="dim">{fmt.SAR(d.value, { decimals: 0 })}</span>
                        <span style={{ minWidth: 50, textAlign: "right" }}>{d.pct.toFixed(1)}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 24 }}>
            <div className="row between">
              <div className="eyebrow">12-month allocation history</div>
              <div className="row gap-10" style={{ fontSize: 11 }}>
                {allocation.history.types.slice(0, 4).map((t, i) => {
                  const palette = ["var(--accent)", "var(--ink)", "#7c3aed", "#0e7490", "#a16207", "#475569"];
                  return (
                    <div key={t} className="row gap-4">
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: palette[i % palette.length] }} />
                      <span className="dim">{t}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <StackedBars
                months={allocation.history.months}
                types={allocation.history.types}
                height={240}
                formatX={m => {
                  const d = new Date(m + "-01");
                  return d.toLocaleString("en-US", { month: "short" });
                }}
              />
            </div>
            <div className="dim" style={{ fontSize: 11.5, marginTop: 8 }}>
              Stacked monthly value (SAR) by asset class, normalized to total.
            </div>
          </div>
        </div>
      </Section>

      {/* P&L */}
      <Section eyebrow="Profit & Loss" title="Where the gains come from">
        <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16 }}>
          <div className="col gap-12">
            <div className="card" style={{ padding: 20 }}>
              <div className="eyebrow">Total realized</div>
              <div className="hero-num" style={{ marginTop: 8, color: pnl.summary.total_realized >= 0 ? "var(--gain)" : "var(--loss)" }}>
                <span className="arrow" style={{ fontSize: 14, marginRight: 4 }}>{pnl.summary.total_realized >= 0 ? "▲" : "▼"}</span>
                {fmt.SAR(Math.abs(pnl.summary.total_realized), { decimals: 0 })}
              </div>
              <div className="dim" style={{ fontSize: 12, marginTop: 6 }}>
                Across {pnl.summary.total_sells} sells · Avg win {fmt.SAR(pnl.summary.avg_win, { decimals: 0 })}, avg loss {fmt.SAR(pnl.summary.avg_loss, { decimals: 0 })}
              </div>
            </div>
            <div className="card" style={{ padding: 20 }}>
              <div className="eyebrow">Total unrealized</div>
              <div className="hero-num" style={{ marginTop: 8, color: pnl.summary.total_unrealized >= 0 ? "var(--gain)" : "var(--loss)" }}>
                <span className="arrow" style={{ fontSize: 14, marginRight: 4 }}>{pnl.summary.total_unrealized >= 0 ? "▲" : "▼"}</span>
                {fmt.SAR(Math.abs(pnl.summary.total_unrealized), { decimals: 0 })}
              </div>
              <div className="dim" style={{ fontSize: 12, marginTop: 6 }}>
                On {pnl.by_asset.length} open positions. Marked to live prices.
              </div>
            </div>
            <div className="card" style={{ padding: 20 }}>
              <div className="row between">
                <div className="eyebrow">Win rate</div>
                <span className="mono dim" style={{ fontSize: 10 }}>{pnl.summary.winning_sells}/{pnl.summary.total_sells}</span>
              </div>
              <div style={{ marginTop: 12 }}>
                <div style={{ height: 8, background: "var(--line-2)", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `${pnl.summary.win_rate_pct}%`, height: "100%", background: "var(--accent)" }} />
                </div>
                <div className="row between" style={{ marginTop: 8, fontSize: 12 }}>
                  <span className="dim">{pnl.summary.win_rate_pct.toFixed(1)}% wins</span>
                  <span className="dim">{(100 - pnl.summary.win_rate_pct).toFixed(1)}% losses</span>
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ overflow: "hidden" }}>
            <div className="row between" style={{ padding: "16px 20px" }}>
              <h4 className="serif" style={{ fontSize: 18 }}>P&L by asset</h4>
              <div className="dim" style={{ fontSize: 11.5 }}>Click any column to sort</div>
            </div>
            <table className="tbl">
              <thead>
                <tr>
                  <SortTh label="Asset"    col="name"        sortState={pnlSort} onToggle={mkToggle(setPnlSort)} />
                  <SortTh label="Type"     col="asset_type"  sortState={pnlSort} onToggle={mkToggle(setPnlSort)} />
                  <SortTh label="Realized"   col="realized"   sortState={pnlSort} onToggle={mkToggle(setPnlSort)} cls="num-cell right" />
                  <SortTh label="Unrealized" col="unrealized" sortState={pnlSort} onToggle={mkToggle(setPnlSort)} cls="num-cell right" />
                  <SortTh label="Total"      col="total"      sortState={pnlSort} onToggle={mkToggle(setPnlSort)} cls="num-cell right" />
                  <SortTh label="Return %"   col="return_pct" sortState={pnlSort} onToggle={mkToggle(setPnlSort)} cls="num-cell right" />
                  <th style={{ width: 120 }}>Contribution</th>
                </tr>
              </thead>
              <tbody>
                {sortRows(pnl.by_asset, pnlSort).map((row, i) => {
                  const maxAbs = Math.max(...pnl.by_asset.map(r => Math.abs(r.total)));
                  const w = (Math.abs(row.total) / maxAbs) * 100;
                  return (
                    <tr key={i}>
                      <td style={{ fontWeight: 500 }}>{row.name}</td>
                      <td><TypeChip type={row.asset_type} /></td>
                      <td className="num-cell right">
                        {row.realized !== 0 ? <Delta value={row.realized} /> : <span className="dim">—</span>}
                      </td>
                      <td className="num-cell right"><Delta value={row.unrealized} /></td>
                      <td className="num-cell right" style={{ fontWeight: 500 }}><Delta value={row.total} /></td>
                      <td className="num-cell right"><Delta value={row.return_pct} suffix="%" /></td>
                      <td>
                        <div style={{ height: 6, background: "var(--line-2)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{
                            width: `${w}%`, height: "100%",
                            background: row.total >= 0 ? "var(--gain)" : "var(--loss)",
                          }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      {/* Trade activity + Cash flow */}
      <Section eyebrow="Activity & Liquidity" title="Trades and the cash that funds them">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div className="card" style={{ padding: 20 }}>
            <div className="row between">
              <h4 className="serif" style={{ fontSize: 18 }}>Trade activity</h4>
              <div className="row gap-12" style={{ fontSize: 11 }}>
                <span className="row gap-4"><div style={{ width: 8, height: 8, borderRadius: 2, background: "var(--accent)" }} /><span className="dim">Buys</span></span>
                <span className="row gap-4"><div style={{ width: 8, height: 8, borderRadius: 2, background: "var(--ink)" }} /><span className="dim">Sells</span></span>
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <PairedBars
                data={monthlyTx}
                keys={["buy_count", "sell_count"]}
                colors={["var(--accent)", "var(--ink)"]}
                height={180}
                formatX={d => {
                  const dt = new Date(d.month + "-01");
                  return dt.toLocaleString("en-US", { month: "short" });
                }}
              />
            </div>
            <div className="hairline" style={{ margin: "16px 0" }} />
            <div className="eyebrow" style={{ marginBottom: 10 }}>Most traded</div>
            <div className="col gap-6">
              {(mostTraded || []).slice(0, 5).map(r => (
                <div key={r.name} className="row between" style={{ fontSize: 12.5, padding: "4px 0" }}>
                  <span>{r.name}</span>
                  <div className="row gap-12 mono dim" style={{ fontSize: 11.5 }}>
                    <span>{r.buy_count} buys</span>
                    <span>{r.sell_count} sells</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: 20 }}>
            <div className="row between">
              <h4 className="serif" style={{ fontSize: 18 }}>Cash flow</h4>
              <div className="row gap-12" style={{ fontSize: 11 }}>
                <span className="row gap-4"><div style={{ width: 8, height: 8, borderRadius: 2, background: "var(--gain)" }} /><span className="dim">Deposits</span></span>
                <span className="row gap-4"><div style={{ width: 8, height: 8, borderRadius: 2, background: "var(--loss)" }} /><span className="dim">Withdrawals</span></span>
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <PairedBars
                data={cashflow.monthly}
                keys={["deposited", "withdrawn"]}
                colors={["var(--gain)", "var(--loss)"]}
                height={180}
                formatY={v => v >= 1000 ? Math.round(v / 1000) + "K" : Math.round(v)}
                formatX={d => {
                  const dt = new Date(d.month + "-01");
                  return dt.toLocaleString("en-US", { month: "short" });
                }}
              />
            </div>
            <div className="hairline" style={{ margin: "16px 0" }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div className="col gap-2">
                <div className="eyebrow" style={{ fontSize: 9.5 }}>Deposited</div>
                <div className="num" style={{ fontWeight: 500 }}>+{fmt.SAR(cashflow.summary.total_deposited, { decimals: 0 })}</div>
              </div>
              <div className="col gap-2">
                <div className="eyebrow" style={{ fontSize: 9.5 }}>Withdrawn</div>
                <div className="num" style={{ fontWeight: 500 }}>−{fmt.SAR(cashflow.summary.total_withdrawn, { decimals: 0 })}</div>
              </div>
              <div className="col gap-2">
                <div className="eyebrow" style={{ fontSize: 9.5 }}>Net injected</div>
                <div className="num" style={{ fontWeight: 500 }}>{fmt.SAR(cashflow.summary.net_injected, { decimals: 0 })}</div>
              </div>
            </div>
            <div style={{ marginTop: 14, padding: 12, background: "var(--paper-2)", borderRadius: 8, border: "1px solid var(--line)" }}>
              <div className="row between" style={{ marginBottom: 6 }}>
                <span className="eyebrow" style={{ fontSize: 9.5 }}>Cash Utilization</span>
                <span className="num" style={{ fontSize: 13, fontWeight: 500 }}>{cashflow.summary.utilization_pct.toFixed(1)}%</span>
              </div>
              <div style={{ height: 6, background: "var(--line-2)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${cashflow.summary.utilization_pct}%`, height: "100%", background: "var(--accent)" }} />
              </div>
              <div className="dim" style={{ fontSize: 11, marginTop: 6 }}>
                Of every 1 SAR injected, {Math.round(cashflow.summary.utilization_pct)} halalas are invested, {Math.round(100 - cashflow.summary.utilization_pct)} sit as cash.
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* Scoreboard */}
      <Section eyebrow="All-Time Scoreboard" title="Every position, ranked"
               action={<div className="dim" style={{ fontSize: 12 }}>Open and closed positions, sorted by total P&L.</div>}>
        <div className="card" style={{ overflow: "hidden" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <SortTh label="Asset"        col="name"         sortState={sbSort} onToggle={mkToggle(setSbSort)} />
                <SortTh label="Type"         col="asset_type"   sortState={sbSort} onToggle={mkToggle(setSbSort)} />
                <th>Status</th>
                <SortTh label="Invested"     col="invested"     sortState={sbSort} onToggle={mkToggle(setSbSort)} cls="num-cell right" />
                <SortTh label="Market Value" col="market_value" sortState={sbSort} onToggle={mkToggle(setSbSort)} cls="num-cell right" />
                <SortTh label="Total P&L"    col="total_pnl"    sortState={sbSort} onToggle={mkToggle(setSbSort)} cls="num-cell right" />
                <SortTh label="Return %"     col="return_pct"   sortState={sbSort} onToggle={mkToggle(setSbSort)} cls="num-cell right" />
                <SortTh label="First bought" col="first_bought" sortState={sbSort} onToggle={mkToggle(setSbSort)} />
              </tr>
            </thead>
            <tbody>
              {sortRows(scoreboard, sbSort).map((s, i) => (
                <tr key={s.name}>
                  <td>
                    <span className="serif" style={{ fontSize: 16, color: i < 3 ? "var(--accent)" : "var(--ink-3)" }}>{i + 1}</span>
                  </td>
                  <td style={{ fontWeight: 500 }}>{s.name}</td>
                  <td><TypeChip type={s.asset_type} /></td>
                  <td>
                    {s.status === "closed"
                      ? <span className="chip" style={{ background: "var(--paper-2)", color: "var(--ink-3)" }}>○ Closed</span>
                      : <span className="chip gold" style={{ background: "var(--gain-soft)", color: "var(--gain)" }}>● Open</span>
                    }
                  </td>
                  <td className="num-cell right dim">{fmt.SAR(s.invested, { decimals: 0 })}</td>
                  <td className="num-cell right">{fmt.SAR(s.market_value, { decimals: 0 })}</td>
                  <td className="num-cell right" style={{ fontWeight: 500 }}><Delta value={s.total_pnl} /></td>
                  <td className="num-cell right"><Delta value={s.return_pct} suffix="%" /></td>
                  <td className="mono dim" style={{ fontSize: 11.5 }}>{s.first_bought}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Footer flourish */}
      <div className="row between" style={{ padding: "8px 4px", borderTop: "1px solid var(--line)" }}>
        <div className="dim" style={{ fontSize: 11.5 }}>
          Data through {new Date().toISOString().slice(0, 10)} · Hourly snapshots · Saudi market close 15:00 Asia/Riyadh
        </div>
        <div className="row gap-8">
          <button className="btn xs">
            <Icon name="mail" size={11} /> Email this
          </button>
          <button className="btn xs">
            <Icon name="download" size={11} /> Export
          </button>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { Analytics });
