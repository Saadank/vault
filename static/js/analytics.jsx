// Analytics screen — overview, true performance, monthly, allocation, activity, cashflow, scoreboard.
// Every headline number appears exactly once; the Overview KPIs are the same
// TWR / net-P&L figures the sections below are built from.

const Analytics = ({ data, onSendReport }) => {
  const { overview, allocation, pnl, monthlyTx, mostTraded, cashflow, scoreboard, performance, fmt, summary, holdings } = data;
  const [allocMode, setAllocMode] = React.useState("type");
  const [sbSort, setSbSort] = React.useState({ col: "total_pnl", dir: -1 });
  const [twrRange, setTwrRange] = React.useState("All");
  const [monthHover, setMonthHover] = React.useState(null);   // hovered row/bar in Monthly Performance

  // ── Per-holding price history (Scoreboard row expand) ─────────────────────
  // Scoreboard rows are keyed by asset name (open + closed positions), but
  // price history is keyed by holding id — only open positions still have one.
  const holdingIdByName = React.useMemo(
    () => Object.fromEntries((holdings || []).map(h => [h.name, h.id])),
    [holdings]
  );
  const [expandedName, setExpandedName] = React.useState(null);
  const [historyCache, setHistoryCache] = React.useState({});
  const toggleHistory = async (name) => {
    if (expandedName === name) { setExpandedName(null); return; }
    setExpandedName(name);
    const id = holdingIdByName[name];
    if (id != null && !historyCache[id]) {
      const rows = await window.fetchHoldingHistory(id);
      setHistoryCache(c => ({ ...c, [id]: rows }));
    }
  };

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
    // Benchmark may start partway through the series (capture began later than
    // the portfolio's own history) — rebase from the first point that has it.
    const baseBmPoint = slice.find(p => p.benchmark_index != null);
    const baseBm = baseBmPoint ? baseBmPoint.benchmark_index : null;
    return slice.map(p => ({
      ...p,
      face_index_r: (p.face_index / baseFace) * 100,
      twr_index_r:  (p.twr_index  / baseTwr)  * 100,
      benchmark_index_r: (baseBm != null && p.benchmark_index != null)
        ? (p.benchmark_index / baseBm) * 100
        : null,
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
            Where your money has been, how it moved, and what it earned. Built from your hourly snapshots and trade history.
          </div>
        </div>
        <div className="row gap-8">
          <button className="btn gold" onClick={onSendReport}>
            <Icon name="mail" size={14} /> Send full report
          </button>
        </div>
      </div>

      {/* Overview KPIs — each is the figure the sections below are built from */}
      <Section
        eyebrow="Overview"
        title="Performance at a glance"
        action={
          overview.twr_start_date && (
            <span className="dim mono" style={{ fontSize: 11 }}>
              Return measured from {overview.twr_start_date}
              {performance && performance.twr_start_reason && (
                <span style={{ marginLeft: 8, color: "var(--gold)" }} title={performance.twr_start_reason}>⚠ data gap before</span>
              )}
            </span>
          )
        }
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          <KPI
            label="True Return (TWR)"
            value={overview.total_return_pct != null ? fmt.PCT(overview.total_return_pct, { sign: true }) : "—"}
            accent={overview.total_return_pct == null ? "var(--ink)" : overview.total_return_pct >= 0 ? "var(--gain)" : "var(--loss)"}
            sub={<span className="dim" style={{ fontSize: 12 }}>Deposits &amp; withdrawals stripped out — what each riyal actually earned</span>}
            large
          />
          <KPI
            label="Net P&L"
            value={fmt.SAR(overview.total_return_sar, { sign: true, decimals: 0 })}
            suffix="SAR"
            accent={overview.total_return_sar >= 0 ? "var(--gain)" : "var(--loss)"}
            sub={
              <span className="dim" style={{ fontSize: 12 }}>
                Realized <Delta value={pnl.summary.total_realized || 0} decimals={0} /> · Unrealized <Delta value={pnl.summary.total_unrealized || 0} decimals={0} />
              </span>
            }
            large
          />
          <KPI
            label="Portfolio Value"
            value={fmt.SAR(overview.current_value, { decimals: 0 })}
            suffix="SAR"
            sub={
              <span className="dim" style={{ fontSize: 12 }}>
                Incl. cash · Peak {fmt.SAR(overview.peak_value, { decimals: 0 })} · Drawdown <Delta value={overview.current_drawdown_pct} suffix="%" />
              </span>
            }
            large
          />
          <KPI
            label="Win Rate"
            value={fmt.PCT(overview.win_rate_pct, { sign: false })}
            sub={
              <span className="dim" style={{ fontSize: 12 }}>
                {overview.winning_sells} winning of {overview.total_sells} sells · avg win {fmt.SAR(overview.avg_win, { sign: true, decimals: 0 })} / loss {fmt.SAR(overview.avg_loss, { decimals: 0 })}
              </span>
            }
            large
          />
        </div>
      </Section>

      {/* True Performance (TWR) chart */}
      {performance && twrSeries.length > 1 && (() => {
        const last = twrSeries[twrSeries.length - 1];
        const rangeReturn = last.twr_index_r - 100;
        const chartColor = rangeReturn >= 0 ? "var(--gain)" : "var(--loss)";
        // Only draw the benchmark once it covers the whole visible range — a
        // partial line (nulls at the start) would corrupt the chart's scale.
        // It fills in day by day as capture accumulates.
        const hasBenchmark = twrSeries.every(p => p.benchmark_index_r != null);
        // Alpha over the *visible* window, so it always pairs with the range
        // return shown beside it (the API's benchmark_alpha_pct is all-time).
        const rangeAlpha = hasBenchmark ? rangeReturn - (last.benchmark_index_r - 100) : null;
        const bmLabel = performance.benchmark_symbol === "^GSPC" ? "S&P 500" : (performance.benchmark_symbol || "Benchmark");
        // No "face value" line: it is the deposit-inflated series (index 260+
        // vs. TWR 107) and sharing an axis with it flattened the TWR line.
        const chartSeries = [
          { label: "True Performance (TWR)", values: twrSeries.map(p => p.twr_index_r), color: chartColor },
        ];
        if (hasBenchmark) {
          chartSeries.push({ label: bmLabel, values: twrSeries.map(p => p.benchmark_index_r), color: "var(--ink-3)", dash: true });
        }
        return (
          <Section
            eyebrow="True Performance"
            title="How each riyal grew over time"
            action={
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
            }
          >
            <div className="card" style={{ padding: "20px 24px 12px" }}>
              <div className="row between" style={{ marginBottom: 12, alignItems: "center" }}>
                <span className="dim mono" style={{ fontSize: 11 }}>
                  {twrRange === "All" ? `Since ${twrSeries[0].date}` : `Last ${twrRange}`} · index = 100 at start
                  {" "}·{" "}
                  <span style={{ color: chartColor, fontWeight: 600 }}>
                    {rangeReturn >= 0 ? "+" : ""}{rangeReturn.toFixed(2)}%
                  </span>
                  {rangeAlpha != null && (
                    <>
                      {" "}·{" "}
                      <span style={{ color: rangeAlpha >= 0 ? "var(--gain)" : "var(--loss)", fontWeight: 600 }}>
                        {rangeAlpha >= 0 ? "+" : ""}{rangeAlpha.toFixed(2)}% vs {bmLabel}
                      </span>
                    </>
                  )}
                  {!hasBenchmark && (
                    <span style={{ marginLeft: 8, color: "var(--ink-3)" }} title={`${bmLabel} comparison appears once the benchmark covers the whole selected range.`}>
                      · benchmark data accumulating
                    </span>
                  )}
                </span>
                {twrRange === "All" && performance.twr_start_reason && (
                  <span className="mono" style={{ fontSize: 11, color: "var(--gold)" }} title={performance.twr_start_reason}>
                    ⚠ starts {performance.twr_start_date} — earlier data unreliable
                  </span>
                )}
              </div>
              <TwrChart
                series={chartSeries}
                xLabels={twrSeries.map(p => p.date.slice(5))}
                height={260}
                yLabel="Index (start = 100)"
              />
            </div>
          </Section>
        );
      })()}

      {/* Monthly performance — market gain vs. deposits, per calendar month */}
      {performance && performance.monthly && performance.monthly.length > 0 && (() => {
        const rows = performance.monthly;
        const reliable = rows.filter(m => !m.unreliable);
        const best  = reliable.reduce((a, m) => (a == null || m.return_pct > a.return_pct) ? m : a, null);
        const worst = reliable.reduce((a, m) => (a == null || m.return_pct < a.return_pct) ? m : a, null);
        const wins  = reliable.filter(m => m.return_pct > 0).length;
        const totalGain = reliable.reduce((s, m) => s + (m.market_gain || 0), 0);
        const hoverRow = monthHover || rows[rows.length - 1];
        const monthName = m => {
          const [yy, mm] = m.split("-");
          return new Date(+yy, +mm - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
        };
        const monthShort = m => {
          const [yy, mm] = m.split("-");
          return new Date(+yy, +mm - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
        };
        const pctCell = (v, { bold } = {}) => v == null
          ? <span className="dim">—</span>
          : <span style={{ color: v > 0 ? "var(--gain)" : v < 0 ? "var(--loss)" : "var(--ink-2)", fontWeight: bold ? 600 : 400 }}>{fmt.PCT(v)}</span>;
        const sarCell = (v, { signed = true, tone = true } = {}) => v == null
          ? <span className="dim">—</span>
          : <span style={{ color: tone ? (v > 0 ? "var(--gain)" : v < 0 ? "var(--loss)" : "var(--ink-2)") : "var(--ink)" }}>{fmt.SAR(v, { sign: signed, decimals: 0 })}</span>;
        return (
          <Section
            eyebrow="Monthly Performance"
            title="What the market did each month, deposits stripped out"
            action={
              <span className="dim mono" style={{ fontSize: 11 }}>
                {reliable.length} of {rows.length} months measurable
                {rows.some(m => m.unreliable) && (
                  <span style={{ marginLeft: 8, color: "var(--gold)" }}
                        title="Months before the TWR start date have snapshots, but deposits didn't reconcile with value changes, so no return is shown.">
                    ⚠ hatched = data gap
                  </span>
                )}
              </span>
            }
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
              <KPI
                label="Market gain · all months"
                value={fmt.SAR(totalGain, { sign: true, decimals: 0 })}
                suffix="SAR"
                accent={totalGain >= 0 ? "var(--gain)" : "var(--loss)"}
                sub={<span className="dim" style={{ fontSize: 11 }}>Sum of monthly gains, deposits excluded</span>}
              />
              <KPI
                label="Best month"
                value={best ? fmt.PCT(best.return_pct) : "—"}
                accent="var(--gain)"
                sub={<span className="dim" style={{ fontSize: 11 }}>{best ? `${monthName(best.month)} · ${fmt.SAR(best.market_gain, { sign: true, decimals: 0 })} SAR` : "No measurable month yet"}</span>}
              />
              <KPI
                label="Worst month"
                value={worst ? fmt.PCT(worst.return_pct) : "—"}
                accent={worst && worst.return_pct < 0 ? "var(--loss)" : "var(--ink)"}
                sub={<span className="dim" style={{ fontSize: 11 }}>{worst ? `${monthName(worst.month)} · ${fmt.SAR(worst.market_gain, { sign: true, decimals: 0 })} SAR` : "No measurable month yet"}</span>}
              />
              <KPI
                label="Positive months"
                value={reliable.length ? `${wins} / ${reliable.length}` : "—"}
                sub={<span className="dim" style={{ fontSize: 11 }}>{reliable.length ? `${Math.round(wins / reliable.length * 100)}% of measured months closed up` : "Waiting for a full month of data"}</span>}
              />
            </div>

            <div className="card" style={{ padding: "20px 24px 12px" }}>
              <div className="row between" style={{ alignItems: "baseline", marginBottom: 8 }}>
                <div className="eyebrow">Return by month · TWR</div>
                <div className="dim mono" style={{ fontSize: 11 }}>
                  {hoverRow && (
                    <>
                      <span style={{ color: "var(--ink)" }}>{monthName(hoverRow.month)}</span>
                      {hoverRow.unreliable
                        ? <span style={{ marginLeft: 8, color: "var(--gold)" }}>data gap · no return</span>
                        : <>
                            {" "}· {pctCell(hoverRow.return_pct, { bold: true })}
                            {" "}· {sarCell(hoverRow.market_gain)} SAR
                            {hoverRow.benchmark_pct != null && <> · S&amp;P {pctCell(hoverRow.benchmark_pct)}</>}
                            {hoverRow.partial_start && <span style={{ marginLeft: 8, opacity: 0.7 }}>partial month</span>}
                          </>}
                    </>
                  )}
                  <span style={{ marginLeft: 12, opacity: 0.7 }}>— tick = S&amp;P 500</span>
                </div>
              </div>
              <MonthlyReturnBars data={rows} height={220} onHover={setMonthHover} />
            </div>

            <div className="card" style={{ overflow: "hidden" }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th className="num-cell right">Start</th>
                    <th className="num-cell right">Deposits</th>
                    <th className="num-cell right">Withdrawals</th>
                    <th className="num-cell right">End</th>
                    <th className="num-cell right">Market gain</th>
                    <th className="num-cell right">Return</th>
                    <th className="num-cell right">S&amp;P 500</th>
                    <th className="num-cell right">vs. market</th>
                  </tr>
                </thead>
                <tbody>
                  {[...rows].reverse().map((m, i) => (
                    <tr key={m.month}
                        onMouseEnter={() => setMonthHover(m)} onMouseLeave={() => setMonthHover(null)}
                        style={{ opacity: m.unreliable ? 0.6 : 1 }}>
                      <td>
                        <div className="row gap-8">
                          <span style={{ fontWeight: 500 }}>{monthShort(m.month)}</span>
                          {i === 0 && !m.unreliable && <span className="chip">to date</span>}
                          {m.partial_start && !m.unreliable && <span className="chip" title="History starts part-way through this month">partial</span>}
                          {m.unreliable && <span className="chip" style={{ color: "var(--gold)" }} title="Deposits in this month didn't reconcile with value changes — return not measurable">data gap</span>}
                        </div>
                      </td>
                      <td className="num-cell right">{fmt.SAR(m.start_value, { decimals: 0 })}</td>
                      <td className="num-cell right">{m.deposits ? <span style={{ color: "var(--ink-2)" }}>+{fmt.SAR(m.deposits, { decimals: 0 })}</span> : <span className="dim">—</span>}</td>
                      <td className="num-cell right">{m.withdrawals ? <span style={{ color: "var(--ink-2)" }}>−{fmt.SAR(m.withdrawals, { decimals: 0 })}</span> : <span className="dim">—</span>}</td>
                      <td className="num-cell right">{fmt.SAR(m.end_value, { decimals: 0 })}</td>
                      <td className="num-cell right">{sarCell(m.market_gain)}</td>
                      <td className="num-cell right">{pctCell(m.return_pct, { bold: true })}</td>
                      <td className="num-cell right">{pctCell(m.benchmark_pct)}</td>
                      <td className="num-cell right">{pctCell(m.alpha_pct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="dim" style={{ fontSize: 11.5, padding: "10px 16px", borderTop: "1px solid var(--line)" }}>
                Market gain = end − start − deposits + withdrawals. Return is the time-weighted return for the month, so a salary deposit on the 1st never counts as a gain.
              </div>
            </div>
          </Section>
        );
      })()}

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
              <div className="eyebrow">Open positions · excl. cash</div>
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
               action={
                 <div className="dim mono" style={{ fontSize: 11 }}>
                   {scoreboard.length} positions · {scoreboard.filter(s => s.status === "open").length} open · {scoreboard.filter(s => s.status === "closed").length} closed · click a column to sort
                 </div>
               }>
        <div className="card" style={{ overflow: "hidden" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <SortTh label="Asset"        col="name"           sortState={sbSort} onToggle={mkToggle(setSbSort)} />
                <SortTh label="Type"         col="asset_type"     sortState={sbSort} onToggle={mkToggle(setSbSort)} />
                <th>Status</th>
                <SortTh label="Invested"     col="invested"       sortState={sbSort} onToggle={mkToggle(setSbSort)} cls="num-cell right" />
                <SortTh label="Market Value" col="market_value"   sortState={sbSort} onToggle={mkToggle(setSbSort)} cls="num-cell right" />
                <SortTh label="Realized"     col="realized_pnl"   sortState={sbSort} onToggle={mkToggle(setSbSort)} cls="num-cell right" />
                <SortTh label="Unrealized"   col="unrealized_pnl" sortState={sbSort} onToggle={mkToggle(setSbSort)} cls="num-cell right" />
                <SortTh label="Total P&L"    col="total_pnl"      sortState={sbSort} onToggle={mkToggle(setSbSort)} cls="num-cell right" />
                <SortTh label="Return %"     col="return_pct"     sortState={sbSort} onToggle={mkToggle(setSbSort)} cls="num-cell right" />
                <SortTh label="First bought" col="first_bought"   sortState={sbSort} onToggle={mkToggle(setSbSort)} />
                <th style={{ width: 32 }}></th>
              </tr>
            </thead>
            <tbody>
              {sortRows(scoreboard, sbSort).map((s, i) => {
                const holdingId = holdingIdByName[s.name];
                const isOpen = holdingId != null;
                const isExpanded = expandedName === s.name;
                const history = isOpen ? historyCache[holdingId] : null;
                return (
                  <React.Fragment key={s.name}>
                    <tr
                      onClick={() => isOpen && toggleHistory(s.name)}
                      style={{ cursor: isOpen ? "pointer" : "default" }}
                      title={isOpen ? "Click to view price history" : "Closed position — no live price history"}
                    >
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
                      <td className="num-cell right dim" title="Sum of every buy ever made in this asset">{fmt.SAR(s.invested, { decimals: 0 })}</td>
                      <td className="num-cell right">{s.market_value ? fmt.SAR(s.market_value, { decimals: 0 }) : <span className="dim">—</span>}</td>
                      <td className="num-cell right">{s.realized_pnl ? <Delta value={s.realized_pnl} /> : <span className="dim">—</span>}</td>
                      <td className="num-cell right">{s.status === "open" ? <Delta value={s.unrealized_pnl} /> : <span className="dim">—</span>}</td>
                      <td className="num-cell right" style={{ fontWeight: 500 }}><Delta value={s.total_pnl} /></td>
                      <td className="num-cell right"><Delta value={s.return_pct} suffix="%" /></td>
                      <td className="mono dim" style={{ fontSize: 11.5 }}>{s.first_bought}</td>
                      <td className="dim" style={{ textAlign: "center" }}>
                        {isOpen && <Icon name={isExpanded ? "chevDown" : "chevRight"} size={12} />}
                      </td>
                    </tr>
                    {isExpanded && isOpen && (
                      <tr>
                        <td colSpan={12} style={{ padding: "4px 16px 18px", background: "var(--paper-2)" }}>
                          {history === undefined || history === null ? (
                            <div className="dim" style={{ fontSize: 12, padding: "10px 0" }}>Loading price history…</div>
                          ) : history.length < 2 ? (
                            // AreaChart needs ≥2 points to draw a line; a single day's
                            // close can't show a trend anyway.
                            <div className="dim" style={{ fontSize: 12, padding: "10px 0" }}>
                              Not enough history yet for {s.name} — VAULT records its close price daily starting today. Check back tomorrow.
                            </div>
                          ) : (
                            <div>
                              <div className="eyebrow" style={{ marginBottom: 6 }}>Price history · {s.name}</div>
                              <AreaChart
                                data={history.map(h => ({ date: h.date, value: h.price }))}
                                height={140}
                                accent={s.total_pnl >= 0 ? "var(--gain)" : "var(--loss)"}
                              />
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Footer */}
      <div className="row between" style={{ padding: "8px 4px", borderTop: "1px solid var(--line)" }}>
        <div className="dim" style={{ fontSize: 11.5 }}>
          Data through {(performance && performance.series.length) ? performance.series[performance.series.length - 1].date : new Date().toISOString().slice(0, 10)}
          {" "}· Hourly snapshots · Saudi market close 15:00 Asia/Riyadh
        </div>
        <button className="btn xs" onClick={onSendReport}>
          <Icon name="mail" size={11} /> Email this report
        </button>
      </div>
    </div>
  );
};

Object.assign(window, { Analytics });
