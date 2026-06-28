// Transactions screen — full audit log with filter, delete-with-reverse confirmation.

const Transactions = ({ data, onReload }) => {
  const { fmt } = data;
  const [filter, setFilter] = React.useState("ALL");
  const [search, setSearch] = React.useState("");
  const [pendingDelete, setPendingDelete] = React.useState(null);
  const [deleting, setDeleting] = React.useState(false);
  const [list, setList] = React.useState(data.transactions || []);

  // Keep local list in sync when parent data reloads
  React.useEffect(() => { setList(data.transactions || []); }, [data.transactions]);

  const types = ["ALL", "BUY", "SELL", "DEPOSIT", "WITHDRAW", "CAPITAL_INCREASE"];

  const filtered = list.filter(t => {
    const matchType = filter === "ALL" || t.tx_type === filter;
    const q = search.trim().toLowerCase();
    const matchSearch = !q || (t.asset_name || "").toLowerCase().includes(q) || (t.notes || "").toLowerCase().includes(q);
    return matchType && matchSearch;
  });

  // Group by month
  const grouped = React.useMemo(() => {
    const map = new Map();
    filtered.forEach(t => {
      const m = t.tx_date?.slice(0, 7) || "0000-00";
      if (!map.has(m)) map.set(m, []);
      map.get(m).push(t);
    });
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  const txMeta = {
    BUY:             { color: "var(--ink-2)",      bg: "var(--paper-2)",    label: "Buy",           icon: "arrowUpRight" },
    SELL:            { color: "var(--accent-ink)", bg: "var(--accent-soft)", label: "Sell",          icon: "arrowDownLeft" },
    DEPOSIT:         { color: "var(--gain)",       bg: "var(--gain-soft)",  label: "Deposit",        icon: "arrowDownLeft" },
    WITHDRAW:        { color: "var(--loss)",       bg: "var(--loss-soft)",  label: "Withdraw",       icon: "arrowUpRight" },
    CAPITAL_INCREASE:{ color: "var(--accent-ink)", bg: "var(--accent-soft)", label: "Cap. Increase", icon: "gift" },
  };
  const META_FALLBACK = { color: "var(--ink-3)", bg: "var(--paper-2)", label: "Other", icon: "arrowUpRight" };

  const monthTotals = (rows) => {
    let buyTotal = 0, sellTotal = 0, deposit = 0, withdraw = 0, realized = 0;
    rows.forEach(t => {
      if (t.tx_type === "BUY") buyTotal += t.total;
      else if (t.tx_type === "SELL") { sellTotal += t.total; realized += t.realized_pnl || 0; }
      else if (t.tx_type === "DEPOSIT") deposit += t.total;
      else if (t.tx_type === "WITHDRAW") withdraw += t.total;
    });
    return { buyTotal, sellTotal, deposit, withdraw, realized };
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      const r = await fetch(`/api/transactions/${pendingDelete.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) throw new Error("Delete failed");
      // Optimistically remove from local list
      setList(l => l.filter(t => t.id !== pendingDelete.id));
      setPendingDelete(null);
      // Then reload all data from server
      onReload && onReload();
    } catch (_) {
      setList(l => l.filter(t => t.id !== pendingDelete.id));
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="col gap-24" style={{ padding: "24px 28px 40px", maxWidth: 1280, margin: "0 auto" }}>
      <div className="row between" style={{ alignItems: "flex-start" }}>
        <div className="col gap-4">
          <div className="eyebrow">Transactions · Audit trail</div>
          <h1 className="serif" style={{ fontSize: 34, lineHeight: 1 }}>Every move, recorded.</h1>
        </div>
      </div>

      {/* Filter bar */}
      <div className="card row between" style={{ padding: "10px 14px" }}>
        <div className="row gap-4">
          {types.map(t => (
            <button key={t} onClick={() => setFilter(t)}
                    style={{
                      padding: "6px 12px",
                      fontSize: 12, fontWeight: 500,
                      borderRadius: 7,
                      color: filter === t ? "var(--ink)" : "var(--ink-3)",
                      background: filter === t ? "var(--paper-2)" : "transparent",
                      border: "1px solid " + (filter === t ? "var(--line)" : "transparent"),
                    }}>
              {t === "ALL" ? "All" : t === "CAPITAL_INCREASE" ? "Capital Increase" : t.charAt(0) + t.slice(1).toLowerCase()}
              <span className="dim mono" style={{ marginLeft: 6, fontSize: 10 }}>
                {t === "ALL" ? list.length : list.filter(x => x.tx_type === t).length}
              </span>
            </button>
          ))}
        </div>
        <div className="row gap-8">
          <div className="row gap-6" style={{ position: "relative" }}>
            <Icon name="search" size={13} style={{ position: "absolute", left: 10, top: 8, color: "var(--ink-3)" }} />
            <input placeholder="Find by asset or note…"
                   value={search} onChange={e => setSearch(e.target.value)}
                   style={{
                     padding: "7px 12px 7px 30px",
                     border: "1px solid var(--line)", borderRadius: 7,
                     background: "var(--paper)", fontSize: 12.5, width: 220,
                   }} />
          </div>
        </div>
      </div>

      {/* Grouped by month */}
      <div className="col gap-24">
        {grouped.map(([month, rows]) => {
          const totals = monthTotals(rows);
          const monthLabel = new Date(month + "-01").toLocaleString("en-US", { month: "long", year: "numeric" });
          return (
            <div key={month} className="col gap-12">
              <div className="row between" style={{ alignItems: "flex-end" }}>
                <h3 className="serif" style={{ fontSize: 22 }}>{monthLabel}</h3>
                <div className="row gap-16" style={{ fontSize: 12 }}>
                  <span className="dim">{rows.length} transactions</span>
                  {totals.buyTotal > 0 && <span><span className="dim">Bought</span> <span className="num">{fmt.SAR(totals.buyTotal, { decimals: 0 })}</span></span>}
                  {totals.sellTotal > 0 && <span><span className="dim">Sold</span> <span className="num">{fmt.SAR(totals.sellTotal, { decimals: 0 })}</span></span>}
                  {totals.realized !== 0 && <span><span className="dim">Realized</span> <Delta value={totals.realized} /></span>}
                </div>
              </div>
              <div className="card" style={{ overflow: "hidden" }}>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th style={{ width: 90 }}>Date</th>
                      <th style={{ width: 130 }}>Type</th>
                      <th>Asset</th>
                      <th className="num-cell right">Quantity</th>
                      <th className="num-cell right">Price</th>
                      <th className="num-cell right">Total (SAR)</th>
                      <th className="num-cell right">Realized P&L</th>
                      <th>Notes</th>
                      <th style={{ width: 80 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(t => {
                      const meta = txMeta[t.tx_type] || META_FALLBACK;
                      return (
                        <tr key={t.id}>
                          <td className="mono dim" style={{ fontSize: 11.5 }}>{t.tx_date}</td>
                          <td>
                            <span style={{
                              display: "inline-flex", alignItems: "center", gap: 6,
                              fontSize: 11, fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase",
                              padding: "3px 8px", borderRadius: 5,
                              color: meta.color, background: meta.bg,
                            }}>
                              <Icon name={meta.icon} size={10} />
                              {meta.label}
                            </span>
                          </td>
                          <td style={{ fontWeight: 500 }}>{t.asset_name}</td>
                          <td className="num-cell right">{t.quantity ?? <span className="dim">—</span>}</td>
                          <td className="num-cell right">{t.price != null ? t.price.toLocaleString() : <span className="dim">—</span>}</td>
                          <td className="num-cell right" style={{ fontWeight: 500 }}>{fmt.SAR(t.total, { decimals: 2 })}</td>
                          <td className="num-cell right">
                            {t.realized_pnl != null ? <Delta value={t.realized_pnl} /> : <span className="dim">—</span>}
                          </td>
                          <td className="dim" style={{ fontSize: 12.5, maxWidth: 220 }}>
                            <span className="truncate" style={{ display: "inline-block", maxWidth: "100%", verticalAlign: "bottom" }}>
                              {t.notes || ""}
                            </span>
                          </td>
                          <td>
                            <div className="row-actions" style={{ justifyContent: "flex-end" }}>
                              <button className="btn xs danger" onClick={() => setPendingDelete(t)}>
                                <Icon name="trash" size={12} /> Reverse
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

        {grouped.length === 0 && (
          <div className="card stripe-bg" style={{ padding: 40, textAlign: "center" }}>
            <div className="dim">No transactions match that filter.</div>
          </div>
        )}
      </div>

      {/* Reverse confirmation modal */}
      {pendingDelete && (
        <div className="scrim" onClick={() => setPendingDelete(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 480 }}>
            <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid var(--line)" }}>
              <div className="eyebrow" style={{ color: "var(--loss)" }}>Reverse Transaction</div>
              <h3 className="serif" style={{ fontSize: 24, lineHeight: 1.1, marginTop: 4 }}>
                Reverse this {txMeta[pendingDelete.tx_type].label.toLowerCase()}?
              </h3>
            </div>
            <div style={{ padding: "20px 24px" }}>
              <div className="dim" style={{ fontSize: 13, lineHeight: 1.55 }}>
                This isn't just a deletion. The financial effect will be fully reversed:
              </div>
              <ul className="col gap-6" style={{ paddingLeft: 18, marginTop: 12, fontSize: 13 }}>
                {pendingDelete.tx_type === "BUY" && (
                  <>
                    <li>Holding quantity reduced by {pendingDelete.quantity}</li>
                    <li>{fmt.SAR(pendingDelete.total, { decimals: 2 })} SAR returned to cash</li>
                  </>
                )}
                {pendingDelete.tx_type === "SELL" && (
                  <>
                    <li>Holding quantity restored ({pendingDelete.quantity} units)</li>
                    <li>{fmt.SAR(pendingDelete.total, { decimals: 2 })} SAR removed from cash</li>
                  </>
                )}
                {pendingDelete.tx_type === "DEPOSIT" && <li>Cash reduced by {fmt.SAR(pendingDelete.total, { decimals: 2 })} SAR</li>}
                {pendingDelete.tx_type === "WITHDRAW" && <li>Cash increased by {fmt.SAR(pendingDelete.total, { decimals: 2 })} SAR</li>}
                {pendingDelete.tx_type === "CAPITAL_INCREASE" && (
                  <>
                    <li>Bonus shares removed ({pendingDelete.quantity} units)</li>
                    <li>Avg cost restored to pre-bonus level</li>
                  </>
                )}
              </ul>
            </div>
            <div style={{ padding: "14px 24px", borderTop: "1px solid var(--line)", background: "var(--paper-2)", borderRadius: "0 0 14px 14px" }} className="row gap-8 between">
              <span className="mono dim" style={{ fontSize: 11 }}>TX #{pendingDelete.id}</span>
              <div className="row gap-8">
                <button className="btn" onClick={() => setPendingDelete(null)}>Cancel</button>
                <button className="btn" style={{ background: "var(--loss)", color: "#fff", borderColor: "var(--loss)" }} onClick={confirmDelete} disabled={deleting}>
                  {deleting ? <span className="dots"><span></span><span></span><span></span></span> : "Reverse transaction"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

Object.assign(window, { Transactions });
