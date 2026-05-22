// VAULT mobile — bottom sheets: Add Holding (Buy), Deposit, Ask Vault, Sell

const MSheet = ({ onClose, children, height = "auto" }) => (
  <div className="sheet-scrim" onClick={onClose}>
    <div className="sheet" style={{ height }} onClick={e => e.stopPropagation()}>
      <div className="handle" />
      {children}
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────
// BUY / ADD HOLDING
// ─────────────────────────────────────────────────────────────
const MBuySheet = ({ data, onClose, onSubmit, prefill }) => {
  const [step, setStep] = useState("search"); // search | form
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState(prefill || null);
  const [qty, setQty] = useState("100");
  const [price, setPrice] = useState(picked ? String(picked.current_price) : "");
  const [type, setType] = useState("Stock");

  React.useEffect(() => {
    if (prefill) { setPicked(prefill); setStep("form"); setPrice(String(prefill.current_price)); }
  }, [prefill]);

  const searchResults = [
    { name: "Saudi Aramco", ticker: "2222.SR", type: "Stock", price: 30.85 },
    { name: "Al Rajhi Bank", ticker: "1120.SR", type: "Stock", price: 92.20 },
    { name: "SABIC", ticker: "2010.SR", type: "Stock", price: 78.10 },
    { name: "stc Group", ticker: "7010.SR", type: "Stock", price: 41.50 },
    { name: "Almarai", ticker: "2280.SR", type: "Stock", price: 54.80 },
    { name: "Ma'aden", ticker: "1211.SR", type: "Stock", price: 52.25 },
    { name: "Apple", ticker: "AAPL", type: "Stock", price: 712.5 },
    { name: "NVIDIA", ticker: "NVDA", type: "Stock", price: 482.10 },
    { name: "Vanguard S&P 500", ticker: "VOO", type: "ETF", price: 2024.6 },
    { name: "Bitcoin", ticker: "BTC-USD", type: "Crypto", price: 256800 },
  ].filter(r => !query || r.name.toLowerCase().includes(query.toLowerCase()) || r.ticker.toLowerCase().includes(query.toLowerCase()));

  const total = (parseFloat(qty) || 0) * (parseFloat(price) || 0);

  return (
    <MSheet onClose={onClose} height={step === "search" ? "80%" : "auto"}>
      <div style={{ padding: "8px 18px 14px", display: "flex", alignItems: "center", gap: 10 }}>
        {step === "form" && (
          <button onClick={() => setStep("search")} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--line)", display: "grid", placeItems: "center" }}>
            <MIcon name="chevLeft" size={15} />
          </button>
        )}
        <div className="serif" style={{ fontSize: 24, flex: 1 }}>{step === "search" ? "Add holding" : `Buy ${picked.name}`}</div>
        <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, display: "grid", placeItems: "center", color: "var(--ink-2)" }}>
          <MIcon name="close" size={16} />
        </button>
      </div>

      {step === "search" && (
        <div style={{ padding: "0 18px 24px", flex: 1, overflow: "auto" }}>
          {/* Asset-type pills */}
          <div style={{ display: "flex", gap: 6, marginBottom: 12, overflowX: "auto" }}>
            {["Stock", "ETF", "Crypto", "Bond", "Real Estate"].map(t => (
              <button key={t} className={"m-pill " + (type === t ? "on" : "")} onClick={() => setType(t)} style={{ flexShrink: 0 }}>
                {t}
              </button>
            ))}
          </div>
          {/* Search */}
          <div style={{ position: "relative" }}>
            <MIcon name="search" size={16} style={{ position: "absolute", left: 14, top: 16, color: "var(--ink-3)" }} />
            <input
              className="m-input"
              style={{ paddingLeft: 40 }}
              placeholder="Search tickers, names…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoFocus
            />
          </div>
          {/* Results */}
          <div className="eyebrow" style={{ marginTop: 16, marginBottom: 8 }}>Top matches</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {searchResults.slice(0, 6).map((r, i) => (
              <button key={i} onClick={() => { setPicked({ ...r, current_price: r.price, asset_type: r.type, currency: r.ticker.endsWith(".SR") ? "SAR" : (r.type === "Crypto" ? "SAR" : "USD") }); setPrice(String(r.price)); setStep("form"); }} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "12px 12px", borderRadius: 10, textAlign: "left",
                border: "1px solid var(--line)", background: "var(--paper)",
              }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: "var(--paper-2)", display: "grid", placeItems: "center", fontFamily: "Instrument Serif", fontSize: 16 }}>{r.name[0]}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>{r.name}</div>
                  <div className="ticker" style={{ marginTop: 1 }}>{r.ticker} · {r.type}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{r.price.toLocaleString()}</div>
                  <div className="ticker">{r.ticker.endsWith(".SR") ? "SAR" : (r.type === "Crypto" ? "SAR" : "USD")}</div>
                </div>
              </button>
            ))}
          </div>
          <button style={{ width: "100%", marginTop: 14, padding: 12, color: "var(--ink-2)", fontSize: 13, border: "1px dashed var(--line)", borderRadius: 10, background: "transparent" }}>
            <MIcon name="plus" size={13} style={{ verticalAlign: "middle", marginRight: 6 }} /> Add custom asset (real estate, private)
          </button>
        </div>
      )}

      {step === "form" && picked && (
        <div style={{ padding: "0 18px 24px" }}>
          {/* Asset header */}
          <div style={{
            display: "flex", alignItems: "center", gap: 12, padding: 14, borderRadius: 12,
            background: "var(--paper-2)", border: "1px solid var(--line-2)",
          }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--paper)", display: "grid", placeItems: "center", fontFamily: "Instrument Serif", fontSize: 18 }}>{picked.name[0]}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{picked.name}</div>
              <div className="ticker">{picked.ticker} · last {picked.current_price} {picked.currency || "SAR"}</div>
            </div>
            <MTypeChip type={picked.asset_type} small />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Quantity</div>
              <input className="m-input" value={qty} onChange={e => setQty(e.target.value)} inputMode="decimal" />
            </div>
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Price / unit</div>
              <input className="m-input" value={price} onChange={e => setPrice(e.target.value)} inputMode="decimal" />
            </div>
          </div>

          <div>
            <div className="eyebrow" style={{ marginBottom: 6, marginTop: 12 }}>Purchase date</div>
            <input className="m-input" value="2026-05-21" readOnly />
          </div>

          <div>
            <div className="eyebrow" style={{ marginBottom: 6, marginTop: 12 }}>Notes <span style={{ color: "var(--ink-3)" }}>(optional)</span></div>
            <input className="m-input" placeholder="e.g. dividend anchor, long-term hold" />
          </div>

          {/* Summary */}
          <div style={{
            marginTop: 16, padding: 16, borderRadius: 12,
            background: "var(--ink)", color: "#f5efe0",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span className="eyebrow" style={{ color: "var(--accent-2)" }}>Total cost</span>
              <span style={{ fontSize: 11, color: "#a89e85" }}>{qty} × {price}</span>
            </div>
            <div className="serif" style={{ fontSize: 32, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>
              {total.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              <span style={{ fontSize: 14, color: "#a89e85", marginLeft: 6 }}>{picked.currency || "SAR"}</span>
            </div>
            <div style={{ fontSize: 11, color: "#a89e85", marginTop: 4 }}>
              Deducts from cash wallet · {F.SAR(data?.summary?.cash_balance || 0, 2)} SAR available
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button onClick={onClose} className="m-btn" style={{ flex: 1 }}>Cancel</button>
            <button onClick={() => { onSubmit && onSubmit({ ...picked, qty, price, total }); onClose(); }} className="m-btn primary" style={{ flex: 2 }}>
              Confirm purchase
            </button>
          </div>
        </div>
      )}
    </MSheet>
  );
};

// ─────────────────────────────────────────────────────────────
// DEPOSIT (also handles withdraw via prop)
// ─────────────────────────────────────────────────────────────
const MDepositSheet = ({ onClose, onSubmit, kind = "deposit" }) => {
  const [amount, setAmount] = useState("5000");
  const quickAmounts = [1000, 5000, 10000, 25000];
  const isDeposit = kind === "deposit";

  return (
    <MSheet onClose={onClose}>
      <div style={{ padding: "8px 18px 14px", display: "flex", alignItems: "center", gap: 10 }}>
        <div className="serif" style={{ fontSize: 24, flex: 1 }}>{isDeposit ? "Deposit funds" : "Withdraw cash"}</div>
        <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, display: "grid", placeItems: "center", color: "var(--ink-2)" }}>
          <MIcon name="close" size={16} />
        </button>
      </div>
      <div style={{ padding: "0 18px 28px" }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>Amount</div>
        <div style={{
          display: "flex", alignItems: "baseline", gap: 8,
          padding: "20px 16px", borderRadius: 14,
          border: "1px solid var(--line)", background: "var(--paper)",
        }}>
          <span className="eyebrow">SAR</span>
          <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" style={{
            flex: 1, border: 0, outline: 0, background: "transparent",
            fontFamily: "Instrument Serif", fontSize: 44, color: "var(--ink)",
            fontVariantNumeric: "tabular-nums",
          }} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginTop: 10 }}>
          {quickAmounts.map(a => (
            <button key={a} className="m-pill" onClick={() => setAmount(String(a))} style={{ justifyContent: "center", padding: "8px 0", fontSize: 12 }}>
              {a.toLocaleString()}
            </button>
          ))}
        </div>

        <div className="eyebrow" style={{ marginTop: 18, marginBottom: 6 }}>From</div>
        <div className="m-card" style={{ padding: 14, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: "var(--accent-soft)", color: "var(--accent-ink)", display: "grid", placeItems: "center", fontFamily: "Instrument Serif", fontWeight: 600 }}>SR</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Al Rajhi · ••8421</div>
            <div className="ticker">Checking · default source</div>
          </div>
          <MIcon name="chevDown" size={14} color="var(--ink-3)" />
        </div>

        <div style={{
          marginTop: 14, padding: 12,
          background: "var(--accent-soft)", borderRadius: 10,
          fontSize: 12, color: "var(--accent-ink)",
          display: "flex", gap: 8, alignItems: "flex-start",
        }}>
          <MIcon name="info" size={14} style={{ marginTop: 1, flexShrink: 0 }} />
          <span>Funds settle instantly to your cash wallet. {isDeposit ? "All future buys deduct from this balance." : "Withdrawal will reduce buying power."}</span>
        </div>

        <button onClick={() => { onSubmit && onSubmit(amount); onClose(); }} className="m-btn primary full" style={{ marginTop: 16 }}>
          {isDeposit ? `Deposit ${parseFloat(amount).toLocaleString()} SAR` : `Withdraw ${parseFloat(amount).toLocaleString()} SAR`}
        </button>
        <div style={{ textAlign: "center", marginTop: 10, fontSize: 11, color: "var(--ink-3)" }}>
          Confirm with Face ID
        </div>
      </div>
    </MSheet>
  );
};

// ─────────────────────────────────────────────────────────────
// ASK VAULT — AI chat sheet
// ─────────────────────────────────────────────────────────────
const MAskSheet = ({ onClose, data }) => {
  const [messages, setMessages] = useState([
    { role: "ai", text: "Hey Saad — I see your vault. Ask me anything about your positions, allocation, or recent activity." },
  ]);
  const [input, setInput] = useState("");
  const suggestions = [
    "Why is SABIC down today?",
    "How am I positioned vs. S&P 500?",
    "What's my crypto exposure?",
    "Should I rebalance?",
  ];

  const send = (text) => {
    if (!text.trim()) return;
    setMessages(m => [...m, { role: "user", text }]);
    setInput("");
    setTimeout(() => {
      let reply = "Let me check…";
      if (/sabic/i.test(text)) reply = "SABIC is down 2.14% — petrochemicals sector dragged on softer ethylene margins this week. You're holding 320 shares at 89.50 avg cost; current price 78.10. Position is −12.7%. No fundamentals shift — sector cycle.";
      else if (/rebalance/i.test(text)) reply = "Your stocks slice is 64% (target 55%). Crypto is light at 4%. A sell of ~30 SABIC + buy of 0.1 BTC would re-center allocation without realizing losses.";
      else if (/crypto/i.test(text)) reply = "0.42 BTC at 256,800 SAR/BTC = 107,856 SAR. That's about 4.1% of your portfolio. You're up +17.6% from cost basis.";
      else if (/s&p|index/i.test(text)) reply = "Your portfolio is +18.4% all-time vs. S&P 500 +14.1% over the same period. Outperforming by 4.3 points, mostly from Aramco and Al Rajhi.";
      setMessages(m => [...m, { role: "ai", text: reply }]);
    }, 600);
  };

  return (
    <MSheet onClose={onClose} height="90%">
      <div style={{ padding: "8px 18px 12px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: "var(--accent-soft)", color: "var(--accent-ink)", display: "grid", placeItems: "center" }}>
          <MIcon name="sparkle" size={16} />
        </div>
        <div style={{ flex: 1 }}>
          <div className="serif" style={{ fontSize: 20, lineHeight: 1 }}>Ask Vault</div>
          <div className="ticker" style={{ marginTop: 2 }}>Reads your live portfolio</div>
        </div>
        <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, display: "grid", placeItems: "center", color: "var(--ink-2)" }}>
          <MIcon name="close" size={16} />
        </button>
      </div>

      <div className="hairline" />

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
        {messages.map((m, i) => (
          <div key={i} style={{
            alignSelf: m.role === "user" ? "flex-end" : "flex-start",
            maxWidth: "82%",
            padding: "10px 13px",
            borderRadius: m.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
            background: m.role === "user" ? "var(--ink)" : "var(--paper-2)",
            color: m.role === "user" ? "#f5efe0" : "var(--ink)",
            border: m.role === "user" ? "none" : "1px solid var(--line-2)",
            fontSize: 13.5, lineHeight: 1.5,
          }}>{m.text}</div>
        ))}
      </div>

      {/* Suggestion chips */}
      {messages.length === 1 && (
        <div style={{ padding: "0 18px 10px", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {suggestions.map(s => (
            <button key={s} className="m-pill" onClick={() => send(s)} style={{ fontSize: 12 }}>
              {s}
            </button>
          ))}
        </div>
      )}

      <div style={{
        padding: "12px 16px 26px", borderTop: "1px solid var(--line)",
        display: "flex", alignItems: "center", gap: 10, background: "var(--paper)",
      }}>
        <input
          className="m-input"
          placeholder="Ask anything about your vault…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && send(input)}
          style={{ flex: 1 }}
        />
        <button onClick={() => send(input)} style={{
          width: 48, height: 48, borderRadius: 12,
          background: "var(--accent)", color: "#fff",
          display: "grid", placeItems: "center", flexShrink: 0,
        }}>
          <MIcon name="send" size={16} />
        </button>
      </div>
    </MSheet>
  );
};

// ─────────────────────────────────────────────────────────────
// SELL
// ─────────────────────────────────────────────────────────────
const MSellSheet = ({ holding, onClose, onSubmit }) => {
  const h = holding;
  const [qty, setQty] = useState(String(Math.floor(h.quantity * 0.5)));
  const [price, setPrice] = useState(String(h.current_price));
  const total = (parseFloat(qty) || 0) * (parseFloat(price) || 0);
  const realized = total - (parseFloat(qty) || 0) * h.avg_cost;

  return (
    <MSheet onClose={onClose}>
      <div style={{ padding: "8px 18px 14px", display: "flex", alignItems: "center", gap: 10 }}>
        <div className="serif" style={{ fontSize: 24, flex: 1 }}>Sell {h.name}</div>
        <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, display: "grid", placeItems: "center", color: "var(--ink-2)" }}>
          <MIcon name="close" size={16} />
        </button>
      </div>
      <div style={{ padding: "0 18px 26px" }}>
        <div className="m-card" style={{ padding: 14, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--paper-2)", display: "grid", placeItems: "center", fontFamily: "Instrument Serif", fontSize: 18 }}>{h.name[0]}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>You own {h.quantity.toLocaleString()} {h.ticker}</div>
            <div className="ticker">avg cost {h.avg_cost} · last {h.current_price}</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Quantity to sell</div>
            <input className="m-input" value={qty} onChange={e => setQty(e.target.value)} inputMode="decimal" />
          </div>
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Sell price</div>
            <input className="m-input" value={price} onChange={e => setPrice(e.target.value)} inputMode="decimal" />
          </div>
        </div>

        {/* % slider chips */}
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          {[25, 50, 75, 100].map(p => (
            <button key={p} className="m-pill" onClick={() => setQty(String(Math.floor(h.quantity * p / 100)))} style={{ flex: 1, justifyContent: "center" }}>
              {p}%
            </button>
          ))}
        </div>

        <div style={{
          marginTop: 18, padding: 16, borderRadius: 12,
          background: "var(--paper-2)", border: "1px solid var(--line-2)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
            <span style={{ color: "var(--ink-2)" }}>Total proceeds</span>
            <span style={{ fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{total.toLocaleString(undefined, { maximumFractionDigits: 2 })} {h.currency}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginTop: 6 }}>
            <span style={{ color: "var(--ink-2)" }}>Realized P&L</span>
            <MDelta value={realized} suffix={" " + h.currency} small />
          </div>
        </div>

        <button onClick={() => { onSubmit && onSubmit({ holding: h, qty, price, realized }); onClose(); }} className="m-btn primary full" style={{ marginTop: 16 }}>
          Confirm sale
        </button>
      </div>
    </MSheet>
  );
};

Object.assign(window, { MSheet, MBuySheet, MDepositSheet, MAskSheet, MSellSheet });
