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
const CURRENCY_RATES = { SAR: 1, USD: 3.75, GBP: 4.73, EUR: 4.08, KWD: 12.19, AED: 1.02 };

const M_SEED_LIST = [
  { symbol: "2222.SR", name: "Saudi Aramco",         exchange: "Tadawul", type: "Stock",  currency: "SAR" },
  { symbol: "1120.SR", name: "Al Rajhi Bank",        exchange: "Tadawul", type: "Stock",  currency: "SAR" },
  { symbol: "2010.SR", name: "SABIC",                exchange: "Tadawul", type: "Stock",  currency: "SAR" },
  { symbol: "7010.SR", name: "stc Group",            exchange: "Tadawul", type: "Stock",  currency: "SAR" },
  { symbol: "2280.SR", name: "Almarai",              exchange: "Tadawul", type: "Stock",  currency: "SAR" },
  { symbol: "1211.SR", name: "Ma'aden",              exchange: "Tadawul", type: "Stock",  currency: "SAR" },
  { symbol: "AAPL",    name: "Apple Inc.",           exchange: "NASDAQ",  type: "Stock",  currency: "USD" },
  { symbol: "NVDA",    name: "NVIDIA Corporation",   exchange: "NASDAQ",  type: "Stock",  currency: "USD" },
  { symbol: "VOO",     name: "Vanguard S&P 500 ETF", exchange: "NYSE",    type: "ETF",    currency: "USD" },
  { symbol: "BTC-USD", name: "Bitcoin",              exchange: "Crypto",  type: "Crypto", currency: "USD" },
];

const MBuySheet = ({ data, onClose, onSubmit, prefill }) => {
  const [step, setStep] = useState(prefill ? "form" : "search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState(prefill || null);
  const [currency, setCurrency] = useState(prefill?.currency || "SAR");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState(prefill ? String(prefill.current_price || "") : "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [fetchingQuote, setFetchingQuote] = useState(false);
  const [type, setType] = useState("Stock");

  // Debounced search — same API as desktop
  const searchRef = React.useRef(null);
  React.useEffect(() => {
    if (!query) { setResults([]); return; }
    clearTimeout(searchRef.current);
    searchRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/prices/search?q=${encodeURIComponent(query)}`, { credentials: "include" });
        if (r.ok) {
          const d = await r.json();
          setResults(d.results || d || []);
        }
      } catch (_) {}
      setSearching(false);
    }, 350);
  }, [query]);

  const displayList = query ? results : M_SEED_LIST.filter(r => r.type === type);

  // Pick a result — fetch live quote then go to form
  const pick = async (r) => {
    const detectedCcy = r.currency || (r.symbol?.endsWith(".SR") ? "SAR" : "USD");
    setPicked({ name: r.name, ticker: r.symbol, asset_type: r.type || type, currency: detectedCcy, current_price: null });
    setCurrency(detectedCcy);
    setPrice("");
    setStep("form");
    setFetchingQuote(true);
    try {
      const q = await fetch(`/api/prices/quote?symbol=${encodeURIComponent(r.symbol)}`, { credentials: "include" });
      if (q.ok) {
        const d = await q.json();
        if (d.price != null) setPrice(String(d.price));
        if (d.currency) setCurrency(d.currency);
        setPicked(prev => ({ ...prev, current_price: d.price, currency: d.currency || detectedCcy }));
      }
    } catch (_) {}
    setFetchingQuote(false);
  };

  const fx = CURRENCY_RATES[currency] || 1;
  const priceN = parseFloat(price) || 0;
  const qtyN = parseFloat(qty) || 0;
  const sarPrice = priceN * fx;
  const total = qtyN * sarPrice;

  const handleConfirm = () => {
    if (!picked || !qtyN || !priceN) return;
    const ccyNote = currency !== "SAR"
      ? `Entered as ${currency} ${priceN} (rate ${fx})${notes ? " — " + notes : ""}`
      : notes || null;
    onSubmit && onSubmit({
      ...picked,
      qty: qtyN,
      price: sarPrice,
      purchase_date: date,
      notes: ccyNote,
    });
    onClose();
  };

  return (
    <MSheet onClose={onClose} height={step === "search" ? "80%" : "auto"}>
      <div style={{ padding: "8px 18px 14px", display: "flex", alignItems: "center", gap: 10 }}>
        {step === "form" && (
          <button onClick={() => setStep("search")} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--line)", display: "grid", placeItems: "center" }}>
            <MIcon name="chevLeft" size={15} />
          </button>
        )}
        <div className="serif" style={{ fontSize: 24, flex: 1 }}>{step === "search" ? "Add holding" : `Buy ${picked?.name || "…"}`}</div>
        <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, display: "grid", placeItems: "center", color: "var(--ink-2)" }}>
          <MIcon name="close" size={16} />
        </button>
      </div>

      {step === "search" && (
        <div style={{ padding: "0 18px 24px", flex: 1, overflow: "auto" }}>
          {/* Asset-type pills — used to browse seed list; ignored during active search */}
          <div style={{ display: "flex", gap: 6, marginBottom: 12, overflowX: "auto" }}>
            {["Stock", "ETF", "Crypto", "Bond", "Real Estate"].map(t => (
              <button key={t} className={"m-pill " + (type === t ? "on" : "")} onClick={() => setType(t)} style={{ flexShrink: 0 }}>
                {t}
              </button>
            ))}
          </div>
          {/* Search input */}
          <div style={{ position: "relative" }}>
            <MIcon name="search" size={16} style={{ position: "absolute", left: 14, top: 16, color: "var(--ink-3)" }} />
            {searching && <span className="dots dim" style={{ position: "absolute", right: 14, top: 18 }}><span/><span/><span/></span>}
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
          {displayList.length > 0 && (
            <div className="eyebrow" style={{ marginTop: 16, marginBottom: 8 }}>
              {query ? "Top matches" : "Popular"}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {displayList.slice(0, 8).map((r, i) => (
              <button key={i} onClick={() => pick(r)} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "12px 12px", borderRadius: 10, textAlign: "left",
                border: "1px solid var(--line)", background: "var(--paper)",
              }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: "var(--paper-2)", display: "grid", placeItems: "center", fontFamily: "Instrument Serif", fontSize: 16 }}>{r.name[0]}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>{r.name}</div>
                  <div className="ticker" style={{ marginTop: 1 }}>{r.symbol} · {r.exchange || r.type}</div>
                </div>
                <div className="ticker">{r.currency || (r.symbol?.endsWith(".SR") ? "SAR" : "USD")}</div>
              </button>
            ))}
            {query && !searching && displayList.length === 0 && (
              <div style={{ padding: "24px 0", textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>
                <MIcon name="search" size={20} style={{ display: "block", margin: "0 auto 8px" }} />
                No matches for "{query}"
              </div>
            )}
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
              <div className="ticker">
                {picked.ticker}
                {fetchingQuote
                  ? <span className="dots dim" style={{ marginLeft: 6 }}><span/><span/><span/></span>
                  : picked.current_price != null ? ` · ${picked.current_price} ${currency}` : " · enter price below"
                }
              </div>
            </div>
            <MTypeChip type={picked.asset_type} small />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Quantity</div>
              <input className="m-input" value={qty} onChange={e => setQty(e.target.value)} inputMode="decimal" placeholder="0" />
            </div>
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Price ({currency})</div>
              <input className="m-input" value={price} onChange={e => setPrice(e.target.value)} inputMode="decimal" placeholder={fetchingQuote ? "loading…" : "0.00"} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Currency</div>
              <select className="m-input" value={currency} onChange={e => setCurrency(e.target.value)} style={{ appearance: "none" }}>
                {Object.keys(CURRENCY_RATES).map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Purchase date</div>
              <input className="m-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>

          <div>
            <div className="eyebrow" style={{ marginBottom: 6, marginTop: 12 }}>Notes <span style={{ color: "var(--ink-3)" }}>(optional)</span></div>
            <input className="m-input" placeholder="e.g. dividend anchor, long-term hold" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          {/* Summary */}
          <div style={{
            marginTop: 16, padding: 16, borderRadius: 12,
            background: "var(--ink)", color: "#f5efe0",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span className="eyebrow" style={{ color: "var(--accent-2)" }}>Total cost (SAR)</span>
              <span style={{ fontSize: 11, color: "#a89e85" }}>{qty || "0"} × {price || "0"}{currency !== "SAR" ? ` ${currency} × ${fx}` : ""}</span>
            </div>
            <div className="serif" style={{ fontSize: 32, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>
              {total.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              <span style={{ fontSize: 14, color: "#a89e85", marginLeft: 6 }}>SAR</span>
            </div>
            <div style={{ fontSize: 11, color: "#a89e85", marginTop: 4 }}>
              Deducts from cash wallet · {F.SAR(data?.summary?.cash_balance || 0, 2)} SAR available
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button onClick={onClose} className="m-btn" style={{ flex: 1 }}>Cancel</button>
            <button onClick={handleConfirm} disabled={!qtyN || !priceN} className="m-btn primary" style={{ flex: 2, opacity: (!qtyN || !priceN) ? 0.5 : 1 }}>
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
  const [currency, setCurrency] = useState(h.currency || "SAR");
  const fx = CURRENCY_RATES[currency] || 1;
  const qtyN = parseFloat(qty) || 0;
  const priceN = parseFloat(price) || 0;
  const sarPrice = priceN * fx;          // proceeds always settle in SAR (portfolio base)
  const total = qtyN * sarPrice;
  const realized = total - qtyN * h.avg_cost;

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
            <div className="eyebrow" style={{ marginBottom: 6 }}>Sell price ({currency})</div>
            <input className="m-input" value={price} onChange={e => setPrice(e.target.value)} inputMode="decimal" />
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Currency</div>
          <select className="m-input" value={currency} onChange={e => setCurrency(e.target.value)} style={{ appearance: "none" }}>
            {Object.keys(CURRENCY_RATES).map(c => <option key={c}>{c}</option>)}
          </select>
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
            <span style={{ color: "var(--ink-2)" }}>Total proceeds (SAR){currency !== "SAR" ? ` · ${priceN} ${currency} × ${fx}` : ""}</span>
            <span style={{ fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{total.toLocaleString(undefined, { maximumFractionDigits: 2 })} SAR</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginTop: 6 }}>
            <span style={{ color: "var(--ink-2)" }}>Realized P&L</span>
            <MDelta value={realized} suffix=" SAR" small />
          </div>
        </div>

        <button onClick={() => { onSubmit && onSubmit({ holding: h, qty, price: sarPrice, realized }); onClose(); }} className="m-btn primary full" style={{ marginTop: 16 }}>
          Confirm sale
        </button>
      </div>
    </MSheet>
  );
};

// ─────────────────────────────────────────────────────────────
// SCAN INVOICE — OCR import from Tadawul broker screenshot
// ─────────────────────────────────────────────────────────────
const MOCRSheet = ({ data, onClose, onBuy, onSell }) => {
  const [step,     setStep]     = useState("upload"); // upload | scanning | review | error
  const [imgUrl,   setImgUrl]   = useState(null);
  const [errMsg,   setErrMsg]   = useState("");
  const [action,   setAction]   = useState("BUY");
  const [ticker,   setTicker]   = useState("");
  const [name,     setName]     = useState("");
  const [qty,      setQty]      = useState("");
  const [price,    setPrice]    = useState("");
  const [currency, setCurrency] = useState("USD");
  const [date,     setDate]     = useState(new Date().toISOString().slice(0, 10));
  const [assetType,setAssetType]= useState("Stock");

  const fileRef = React.useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    setImgUrl(URL.createObjectURL(file));
    setStep("scanning");

    const form = new FormData();
    form.append("file", file);
    try {
      const r = await fetch("/api/ocr/parse-invoice", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.detail || `Server error (${r.status})`);
      }
      const d = await r.json();
      setAction(d.action  || "BUY");
      setTicker(d.ticker  || "");
      setName(d.name      || "");
      setQty(d.quantity != null  ? String(d.quantity) : "");
      setPrice(d.price   != null ? String(d.price)    : "");
      setCurrency(d.currency || "USD");
      if (d.date) setDate(d.date);
      setStep("review");
    } catch (e) {
      setErrMsg(e.message);
      setStep("error");
    }
  };

  const handleConfirm = () => {
    const qtyN   = parseFloat(qty);
    const priceN = parseFloat(price);
    if (!qtyN || !priceN || !name) return;

    const fx          = CURRENCY_RATES[currency] || 1;
    const priceInSAR  = priceN * fx;
    const ccyNote     = currency !== "SAR" ? `${currency} ${priceN} × ${fx}` : null;

    if (action === "BUY") {
      onBuy && onBuy({
        name,
        ticker: ticker || null,
        asset_type: assetType,
        qty: qtyN,
        price: priceInSAR,
        purchase_date: date,
        notes: ccyNote,
      });
    } else {
      const holding = data?.holdings?.find(
        h => h.ticker === ticker
          || (ticker && h.name?.toLowerCase().includes(ticker.toLowerCase()))
      );
      if (!holding) {
        setErrMsg(`${ticker || name} not found in your portfolio — add it first as a buy.`);
        setStep("error");
        return;
      }
      onSell && onSell({ holding, qty: String(qtyN), price: String(priceInSAR) });
    }
    onClose();
  };

  const qtyN   = parseFloat(qty)   || 0;
  const priceN = parseFloat(price) || 0;
  const fx     = CURRENCY_RATES[currency] || 1;
  const sarTotal = qtyN * priceN * fx;
  const canConfirm = qtyN > 0 && priceN > 0 && name.trim().length > 0;

  return (
    <MSheet onClose={onClose} height={step === "review" ? "92%" : "auto"}>
      {/* Header */}
      <div style={{ padding: "8px 18px 14px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: "var(--accent-soft)", color: "var(--accent-ink)", display: "grid", placeItems: "center" }}>
          <MIcon name="scan" size={16} />
        </div>
        <div style={{ flex: 1 }}>
          <div className="serif" style={{ fontSize: 20, lineHeight: 1 }}>Scan Invoice</div>
          <div className="ticker" style={{ marginTop: 2 }}>Import from Tadawul broker app</div>
        </div>
        <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, display: "grid", placeItems: "center", color: "var(--ink-2)" }}>
          <MIcon name="close" size={16} />
        </button>
      </div>
      <div className="hairline" />

      {/* ── Upload ────────────────────────────────────────────────── */}
      {step === "upload" && (
        <div style={{ padding: "24px 18px 36px" }}>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: "none" }}
            onChange={e => handleFile(e.target.files?.[0])}
          />
          <div
            onClick={() => fileRef.current?.click()}
            style={{
              border: "1.5px dashed var(--line)",
              borderRadius: 16,
              padding: "40px 24px",
              textAlign: "center",
              cursor: "pointer",
              background: "var(--paper-2)",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <div style={{
              width: 60, height: 60, borderRadius: 18,
              background: "var(--accent-soft)", color: "var(--accent-ink)",
              display: "grid", placeItems: "center", margin: "0 auto 16px",
            }}>
              <MIcon name="camera" size={30} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
              Take or upload photo
            </div>
            <div className="ticker">
              Screenshot from Aljazira, Mubasher, Frqan, or any Tadawul broker
            </div>
          </div>
          <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 10, background: "var(--accent-soft)", fontSize: 12, color: "var(--accent-ink)", display: "flex", gap: 8, alignItems: "flex-start" }}>
            <MIcon name="info" size={13} style={{ marginTop: 1, flexShrink: 0 }} />
            <span>OCR runs locally on the server — no data is sent to any external API.</span>
          </div>
        </div>
      )}

      {/* ── Scanning ──────────────────────────────────────────────── */}
      {step === "scanning" && (
        <div style={{ padding: "32px 18px 40px", textAlign: "center" }}>
          {imgUrl && (
            <img
              src={imgUrl}
              style={{ width: "100%", maxHeight: 180, objectFit: "contain", borderRadius: 12, marginBottom: 24 }}
              alt="invoice preview"
            />
          )}
          <div className="dots dim" style={{ marginBottom: 14 }}>
            <span/><span/><span/>
          </div>
          <div style={{ fontSize: 15, fontWeight: 500 }}>Reading invoice…</div>
          <div className="ticker" style={{ marginTop: 4 }}>
            Extracting details with OCR
          </div>
        </div>
      )}

      {/* ── Error ─────────────────────────────────────────────────── */}
      {step === "error" && (
        <div style={{ padding: "24px 18px 36px" }}>
          <div style={{
            color: "var(--loss)", fontSize: 13, marginBottom: 16,
            padding: 14, background: "rgba(220,50,50,0.07)", borderRadius: 10,
          }}>
            {errMsg}
          </div>
          <button className="m-btn full" onClick={() => setStep("upload")}>Try again</button>
        </div>
      )}

      {/* ── Review ────────────────────────────────────────────────── */}
      {step === "review" && (
        <div style={{ padding: "16px 18px 36px", overflowY: "auto", flex: 1 }}>

          {/* Action toggle */}
          <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
            {["BUY", "SELL"].map(a => (
              <button
                key={a}
                onClick={() => setAction(a)}
                style={{
                  flex: 1, padding: "11px 0", borderRadius: 10,
                  border: "none", cursor: "pointer",
                  fontWeight: 600, fontSize: 13,
                  background: action === a
                    ? (a === "BUY" ? "var(--gain)" : "var(--loss)")
                    : "var(--paper-2)",
                  color: action === a ? "#fff" : "var(--ink-2)",
                  transition: "background 0.15s",
                }}
              >
                {a === "BUY" ? "Buy" : "Sell"}
              </button>
            ))}
          </div>

          {/* Fields */}
          <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div className="eyebrow" style={{ marginBottom: 5 }}>Ticker</div>
                <input
                  className="m-input"
                  value={ticker}
                  onChange={e => setTicker(e.target.value.toUpperCase())}
                  placeholder="TSLA"
                />
              </div>
              <div>
                <div className="eyebrow" style={{ marginBottom: 5 }}>Type</div>
                <select
                  className="m-input"
                  value={assetType}
                  onChange={e => setAssetType(e.target.value)}
                  style={{ appearance: "none" }}
                >
                  {["Stock", "ETF", "Fund", "Crypto", "Bond"].map(t => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <div className="eyebrow" style={{ marginBottom: 5 }}>Name</div>
              <input
                className="m-input"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Tesla, Inc"
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div className="eyebrow" style={{ marginBottom: 5 }}>Quantity</div>
                <input
                  className="m-input"
                  value={qty}
                  onChange={e => setQty(e.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                />
              </div>
              <div>
                <div className="eyebrow" style={{ marginBottom: 5 }}>Price ({currency})</div>
                <input
                  className="m-input"
                  value={price}
                  onChange={e => setPrice(e.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div className="eyebrow" style={{ marginBottom: 5 }}>Currency</div>
                <select
                  className="m-input"
                  value={currency}
                  onChange={e => setCurrency(e.target.value)}
                  style={{ appearance: "none" }}
                >
                  {["SAR", "USD", "GBP", "EUR", "KWD"].map(c => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="eyebrow" style={{ marginBottom: 5 }}>Date</div>
                <input
                  className="m-input"
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Summary bar */}
          {sarTotal > 0 && (
            <div style={{
              marginTop: 18, padding: "14px 16px", borderRadius: 12,
              background: action === "BUY" ? "var(--accent-soft)" : "rgba(220,50,50,0.07)",
              color: action === "BUY" ? "var(--accent-ink)" : "var(--loss)",
            }}>
              <div className="eyebrow" style={{ marginBottom: 4 }}>
                {action === "BUY" ? "Total cost" : "Proceeds"} (SAR)
              </div>
              <div className="serif" style={{ fontSize: 30, fontVariantNumeric: "tabular-nums" }}>
                {sarTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                <span style={{ fontSize: 13, marginLeft: 6, opacity: 0.7 }}>SAR</span>
              </div>
              {currency !== "SAR" && (
                <div style={{ fontSize: 11, marginTop: 3, opacity: 0.7 }}>
                  {currency} {priceN} × {qtyN} × {fx} rate
                </div>
              )}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
            <button onClick={onClose} className="m-btn" style={{ flex: 1 }}>
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!canConfirm}
              className="m-btn primary"
              style={{
                flex: 2,
                opacity: canConfirm ? 1 : 0.45,
                background: action === "SELL" ? "var(--loss)" : undefined,
              }}
            >
              Confirm {action === "BUY" ? "purchase" : "sale"}
            </button>
          </div>
        </div>
      )}
    </MSheet>
  );
};

Object.assign(window, { MSheet, MBuySheet, MDepositSheet, MAskSheet, MSellSheet });
