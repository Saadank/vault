// Modals + AI Chat drawer — wired to real API endpoints.

const Modal = ({ open, onClose, title, eyebrow, children, footer, width }) => {
  React.useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" style={{ width: width || 520 }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid var(--line)" }}>
          <div className="row between" style={{ alignItems: "flex-start" }}>
            <div className="col gap-4">
              {eyebrow && <div className="eyebrow">{eyebrow}</div>}
              <h3 className="serif" style={{ fontSize: 26, lineHeight: 1.1 }}>{title}</h3>
            </div>
            <button className="btn ghost" onClick={onClose} style={{ padding: 6, borderRadius: 8 }}>
              <Icon name="close" size={16} />
            </button>
          </div>
        </div>
        <div style={{ padding: "20px 24px" }}>{children}</div>
        {footer && (
          <div style={{ padding: "14px 24px", borderTop: "1px solid var(--line)", background: "var(--paper-2)", borderRadius: "0 0 14px 14px" }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

// ---- Add Holding (Buy) ----
// Currency rates vs SAR (fixed peg / approximations)
const CURRENCY_RATES = { SAR: 1, USD: 3.75, GBP: 4.73, EUR: 4.08, KWD: 12.19, AED: 1.02 };
const toSAR = (amount, ccy) => amount * (CURRENCY_RATES[ccy] || 1);
// Types that don't require a ticker (manual name entry, no search needed)
const NO_TICKER_TYPES = new Set(["Fund", "Bond", "Real Estate", "Alternative", "Other"]);

const BuyModal = ({ open, onClose, onConfirm, cashBalance }) => {
  const [step, setStep]               = React.useState("search");
  const [manualMode, setManualMode]   = React.useState(false);  // skip search for non-market assets
  const [query, setQuery]             = React.useState("");
  const [searchResults, setSearchResults] = React.useState([]);
  const [searching, setSearching]     = React.useState(false);
  const [picked, setPicked]           = React.useState(null);
  const [manualName, setManualName]   = React.useState("");     // for manual-mode name field
  const [assetType, setAssetType]     = React.useState("Stock");
  const [currency, setCurrency]       = React.useState("SAR");  // user-selectable currency
  const [qty, setQty]                 = React.useState("");
  const [price, setPrice]             = React.useState("");
  const [date, setDate]               = React.useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes]             = React.useState("");
  const [submitting, setSubmitting]   = React.useState(false);
  const [apiError, setApiError]       = React.useState("");

  const seedList = [
    { symbol: "2222.SR", name: "Saudi Aramco",        exchange: "Tadawul", type: "Stock", currency: "SAR", price: null },
    { symbol: "1120.SR", name: "Al Rajhi Bank",       exchange: "Tadawul", type: "Stock", currency: "SAR", price: null },
    { symbol: "2010.SR", name: "SABIC",                exchange: "Tadawul", type: "Stock", currency: "SAR", price: null },
    { symbol: "AAPL",    name: "Apple Inc.",           exchange: "NASDAQ",  type: "Stock", currency: "USD", price: null },
    { symbol: "VOO",     name: "Vanguard S&P 500 ETF", exchange: "NYSE",   type: "ETF",   currency: "USD", price: null },
    { symbol: "BTC-USD", name: "Bitcoin",              exchange: "Crypto",  type: "Crypto",currency: "USD", price: null },
  ];

  // Reset all state on open
  React.useEffect(() => {
    if (open) {
      setStep("search"); setManualMode(false); setQuery(""); setPicked(null);
      setManualName(""); setAssetType("Stock"); setCurrency("SAR");
      setQty(""); setPrice(""); setNotes(""); setApiError(""); setSearchResults([]);
    }
  }, [open]);

  // Debounced ticker search
  const searchRef = React.useRef(null);
  React.useEffect(() => {
    if (!query) { setSearchResults([]); return; }
    clearTimeout(searchRef.current);
    searchRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/prices/search?q=${encodeURIComponent(query)}`, { credentials: "include" });
        if (r.ok) {
          const d = await r.json();
          setSearchResults(d.results || d || []);
        }
      } catch (_) {}
      setSearching(false);
    }, 350);
  }, [query]);

  const displayList = query ? searchResults : seedList;

  // User picked a search result → fetch live quote then go to details
  const pick = async (r) => {
    setPicked(r);
    setAssetType(r.type || "Stock");
    // Currency from the search/seed result; default to SAR for .SR tickers
    const detectedCcy = r.currency && r.currency !== "" ? r.currency : (r.symbol?.endsWith(".SR") ? "SAR" : "SAR");
    setCurrency(detectedCcy);
    setPrice(r.price != null ? r.price.toString() : "");
    setStep("details");

    // Fetch live quote to fill price + confirm currency
    if (r.symbol) {
      try {
        const q = await fetch(`/api/prices/quote?symbol=${encodeURIComponent(r.symbol)}`, { credentials: "include" });
        if (q.ok) {
          const d = await q.json();
          if (d.price != null) setPrice(d.price.toString());
          if (d.currency && d.currency !== "") setCurrency(d.currency);
        }
      } catch (_) {}
    }
  };

  // Manual mode: go straight to details with empty asset
  const goManual = (type = "Bond") => {
    setManualMode(true);
    setAssetType(type);
    setCurrency("SAR");
    setPicked({ symbol: null, name: "", exchange: "Manual", type });
    setStep("details");
  };

  // Derived
  const qtyN     = parseFloat(qty)   || 0;
  const priceN   = parseFloat(price) || 0;
  const fx       = CURRENCY_RATES[currency] || 1;
  const sarPrice = priceN * fx;                   // price converted to SAR
  const total    = qtyN * sarPrice;               // total cost in SAR
  const enough   = total <= (cashBalance || 0);
  const effectiveName = manualMode ? manualName.trim() : picked?.name || "";
  const canConfirm = enough && qtyN > 0 && priceN > 0 && effectiveName.length > 0 && !submitting;

  const handleConfirm = async () => {
    setSubmitting(true);
    setApiError("");
    try {
      // Build a note recording the original currency if it differs from SAR
      const ccyNote = currency !== "SAR"
        ? `Entered as ${currency} ${priceN.toLocaleString("en-US", { maximumFractionDigits: 6 })} (rate ${fx})${notes ? " — " + notes : ""}`
        : notes || null;

      const r = await fetch("/api/portfolio/holdings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name:          effectiveName,
          ticker:        manualMode ? null : (picked?.symbol || null),
          asset_type:    assetType,
          quantity:      qtyN,
          avg_cost:      sarPrice,       // ← always stored in SAR
          current_price: sarPrice,       // ← always stored in SAR
          purchase_date: date,
          notes:         ccyNote,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.detail || "Purchase failed");
      }
      onConfirm && onConfirm({ name: effectiveName, qty: qtyN });
      onClose();
    } catch (err) {
      setApiError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Currency selector shared between steps
  const CurrencySelect = () => (
    <select className="input" value={currency} onChange={e => setCurrency(e.target.value)}
            style={{ fontFamily: "Geist Mono, monospace", fontSize: 12 }}>
      {Object.keys(CURRENCY_RATES).map(c => <option key={c} value={c}>{c}</option>)}
    </select>
  );

  return (
    <Modal open={open} onClose={onClose}
           eyebrow={step === "search" ? "Add Holding · Step 1" : "Add Holding · Step 2"}
           title={step === "search" ? "Find an asset" : manualMode ? `Add ${assetType}` : `Buy ${effectiveName || "…"}`}
           footer={step === "details" ? (
             <div className="row between">
               <div className="col" style={{ fontSize: 12 }}>
                 <div className="dim">Total cost (SAR)</div>
                 <div className="serif num" style={{ fontSize: 22, lineHeight: 1.1 }}>
                   {VAULT_DATA.fmt.SAR(total, { decimals: 2 })}
                   <span style={{ fontFamily: "Geist", fontSize: 11, color: "var(--ink-2)", marginLeft: 6 }}>SAR</span>
                 </div>
               </div>
               <div className="row gap-8">
                 <button className="btn" onClick={() => { setStep("search"); setManualMode(false); }}>Back</button>
                 <button className="btn gold" disabled={!canConfirm} onClick={handleConfirm}>
                   {submitting ? <span className="dots"><span></span><span></span><span></span></span> : "Confirm purchase"}
                 </button>
               </div>
             </div>
           ) : null}>

      {/* ── Step 1: Search ──────────────────────────────── */}
      {step === "search" && (
        <div className="col gap-12">
          <div className="row" style={{ position: "relative" }}>
            <Icon name="search" size={15} style={{ position: "absolute", left: 12, top: 13, color: "var(--ink-3)" }} />
            {searching && <span className="dots dim" style={{ position: "absolute", right: 12, top: 14 }}><span></span><span></span><span></span></span>}
            <input className="input" autoFocus placeholder="Aramco, AAPL, 2222.SR, BTC-USD…"
                   value={query} onChange={e => setQuery(e.target.value)}
                   style={{ paddingLeft: 36 }} />
          </div>

          <div className="col" style={{ maxHeight: 280, overflow: "auto", margin: "0 -24px" }}>
            {displayList.map((r, idx) => (
              <button key={r.symbol || idx} onClick={() => pick(r)}
                      style={{
                        textAlign: "left", padding: "11px 24px",
                        display: "grid", gridTemplateColumns: "1fr auto auto",
                        gap: 12, alignItems: "center",
                        borderBottom: "1px solid var(--line-2)", cursor: "pointer",
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = "var(--paper-2)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <div className="col gap-3">
                  <div className="row gap-8">
                    <span style={{ fontWeight: 500 }}>{r.name}</span>
                    <TypeChip type={r.type || r.quoteType || "Stock"} />
                  </div>
                  <div className="row gap-8 dim" style={{ fontSize: 11.5 }}>
                    <span className="mono">{r.symbol}</span>·<span>{r.exchange}</span>
                  </div>
                </div>
                {r.price != null && <div className="num" style={{ fontVariantNumeric: "tabular-nums" }}>{r.price.toLocaleString()}</div>}
                <span className="mono dim" style={{ fontSize: 11 }}>{r.currency || ""}</span>
              </button>
            ))}
            {query && !searching && searchResults.length === 0 && (
              <div style={{ padding: 24 }} className="dim center col gap-8">
                <Icon name="search" size={20} />
                <div>No matches. Try a different ticker.</div>
              </div>
            )}
          </div>

          {/* Manual / non-market asset entry */}
          <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
            <div className="dim" style={{ fontSize: 11.5, marginBottom: 8 }}>
              Adding a fund, bond, real estate, or other non-market asset?
            </div>
            <div className="row gap-8" style={{ flexWrap: "wrap" }}>
              {["Fund", "Bond", "Real Estate", "Alternative", "Other"].map(t => (
                <button key={t} className="btn xs" onClick={() => goManual(t)}>
                  + {t}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Step 2: Details ─────────────────────────────── */}
      {step === "details" && (
        <div className="col gap-16">
          {/* Asset header */}
          {manualMode ? (
            <div className="col gap-6">
              <label className="label">Asset name</label>
              <input className="input" autoFocus placeholder={`e.g. Saudi Government Bond 2030`}
                     value={manualName} onChange={e => setManualName(e.target.value)} />
            </div>
          ) : (
            <div className="row gap-12" style={{ padding: 12, background: "var(--paper-2)", borderRadius: 10, border: "1px solid var(--line)" }}>
              <div style={{
                width: 40, height: 40, borderRadius: 8,
                background: "var(--ink)", color: "var(--accent-2)",
                display: "grid", placeItems: "center",
                fontFamily: "Geist Mono, monospace", fontWeight: 600, fontSize: 12,
              }}>{(picked?.symbol || picked?.name || "?").slice(0, 3).toUpperCase()}</div>
              <div className="col gap-4 grow">
                <div className="row gap-8">
                  <span style={{ fontWeight: 500 }}>{picked?.name}</span>
                  <TypeChip type={assetType} />
                </div>
                <div className="row gap-8 dim" style={{ fontSize: 11.5 }}>
                  {picked?.symbol && <span className="mono">{picked.symbol}</span>}
                  {picked?.exchange && <><span>·</span><span>{picked.exchange}</span></>}
                </div>
              </div>
            </div>
          )}

          {/* Input grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="col">
              <label className="label">Quantity</label>
              <input className="input num" inputMode="decimal"
                     value={qty} onChange={e => setQty(e.target.value)}
                     placeholder="0" autoFocus={manualMode ? false : true} />
            </div>

            {/* Price + currency selector side by side */}
            <div className="col">
              <label className="label">Price per unit</label>
              <div className="row gap-0">
                <input className="input num" inputMode="decimal"
                       value={price} onChange={e => setPrice(e.target.value)}
                       placeholder="0.00"
                       style={{ borderRadius: "7px 0 0 7px", borderRight: "none", flex: 1 }} />
                <select value={currency} onChange={e => setCurrency(e.target.value)}
                        style={{
                          border: "1px solid var(--line)", borderRadius: "0 7px 7px 0",
                          background: "var(--paper-2)", padding: "0 10px",
                          fontFamily: "Geist Mono, monospace", fontSize: 12,
                          color: "var(--accent-ink)", cursor: "pointer",
                          minWidth: 70,
                        }}>
                  {Object.keys(CURRENCY_RATES).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {currency !== "SAR" && priceN > 0 && (
                <div className="mono dim" style={{ fontSize: 11, marginTop: 4 }}>
                  = {VAULT_DATA.fmt.SAR(sarPrice, { decimals: 2 })} SAR (@ {fx})
                </div>
              )}
            </div>

            <div className="col">
              <label className="label">Purchase date</label>
              <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="col">
              <label className="label">Asset type</label>
              <select className="input" value={assetType} onChange={e => setAssetType(e.target.value)}>
                <option>Stock</option><option>ETF</option><option>Crypto</option>
                <option>Fund</option><option>Real Estate</option><option>Bond</option><option>Alternative</option><option>Other</option>
              </select>
            </div>
            <div className="col" style={{ gridColumn: "1 / -1" }}>
              <label className="label">Notes (optional)</label>
              <input className="input" value={notes} onChange={e => setNotes(e.target.value)}
                     placeholder="Long-term hold, dividend anchor…" />
            </div>
          </div>

          {apiError && (
            <div style={{ padding: "8px 12px", background: "var(--loss-soft)", border: "1px solid var(--loss)", borderRadius: 8, color: "var(--loss)", fontSize: 12.5 }}>
              {apiError}
            </div>
          )}

          {/* Cost summary */}
          <div className="col gap-8" style={{ padding: 14, borderRadius: 10, background: "var(--paper-2)", border: "1px solid var(--line)" }}>
            {currency !== "SAR" && (
              <div className="row between">
                <span className="dim">Subtotal ({currency})</span>
                <span className="num">{(qtyN * priceN).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}</span>
              </div>
            )}
            {currency !== "SAR" && (
              <div className="row between">
                <span className="dim">FX rate ({currency} → SAR)</span>
                <span className="num">× {fx}</span>
              </div>
            )}
            <div className="row between" style={{ fontWeight: 500 }}>
              <span className="dim">Total cost (SAR)</span>
              <span className="num">{VAULT_DATA.fmt.SAR(total, { decimals: 2 })} SAR</span>
            </div>
            <div className="hairline" />
            <div className="row between">
              <span className="dim">Cash available</span>
              <span className={`num ${enough ? "" : "delta down"}`}>
                {VAULT_DATA.fmt.SAR(cashBalance, { decimals: 2 })} SAR
              </span>
            </div>
            <div className="row between">
              <span className="dim">Remaining after buy</span>
              <span className={`num ${enough ? "" : "delta down"}`}>
                {enough ? VAULT_DATA.fmt.SAR(cashBalance - total, { decimals: 2 }) + " SAR" : "Insufficient cash"}
              </span>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};

// ---- Sell ----
const SellModal = ({ open, onClose, holding, onConfirm }) => {
  const [qty, setQty]         = React.useState("");
  const [price, setPrice]     = React.useState(holding?.current_price?.toString() || "");
  const [currency, setCurrency] = React.useState("SAR");
  const [date, setDate]       = React.useState(new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = React.useState(false);
  const [apiError, setApiError] = React.useState("");

  React.useEffect(() => {
    if (open && holding) {
      setQty("");
      setPrice(holding.current_price.toString());
      setCurrency("SAR");   // sell price defaults to SAR (price stored in SAR in DB)
      setApiError("");
    }
  }, [open, holding]);

  if (!holding) return null;
  const qtyN     = parseFloat(qty)   || 0;
  const priceN   = parseFloat(price) || 0;
  const fx       = CURRENCY_RATES[currency] || 1;
  const sarPrice = priceN * fx;               // sell price in SAR
  const proceeds   = qtyN * sarPrice;         // proceeds in SAR
  const costBasis  = qtyN * holding.avg_cost; // avg_cost already in SAR in DB
  const realized   = proceeds - costBasis;
  const valid      = qtyN > 0 && qtyN <= holding.quantity && priceN > 0;

  const handleConfirm = async () => {
    setSubmitting(true);
    setApiError("");
    try {
      const r = await fetch("/api/portfolio/sell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          holding_id: holding.id,
          quantity:   qtyN,
          price:      sarPrice,    // always send price in SAR
          tx_date:    date,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.detail || "Sell failed");
      }
      onConfirm && onConfirm({ holding, qty: qtyN, price: priceN, proceeds, realized, date });
      onClose();
    } catch (err) {
      setApiError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose}
           eyebrow="Sell position"
           title={`Sell ${holding.name}`}
           footer={
             <div className="row between">
               <div className="col" style={{ fontSize: 12 }}>
                 <div className="dim">Realized P&L</div>
                 <div className={`serif num delta ${realized > 0 ? "up" : realized < 0 ? "down" : "flat"}`}
                      style={{ fontSize: 22, lineHeight: 1.1 }}>
                   <span className="arrow">{realized > 0 ? "▲" : realized < 0 ? "▼" : "■"}</span>
                   <span>{VAULT_DATA.fmt.SAR(Math.abs(realized), { decimals: 2 })}<span style={{ fontFamily: "Geist", fontSize: 11, marginLeft: 4 }}>SAR</span></span>
                 </div>
               </div>
               <div className="row gap-8">
                 <button className="btn" onClick={onClose}>Cancel</button>
                 <button className="btn primary" disabled={!valid || submitting} onClick={handleConfirm}>
                   {submitting ? <span className="dots"><span></span><span></span><span></span></span> : "Confirm sell"}
                 </button>
               </div>
             </div>
           }>
      <div className="col gap-16">
        <div className="row gap-12" style={{ padding: 12, background: "var(--paper-2)", borderRadius: 10, border: "1px solid var(--line)" }}>
          <div className="col gap-4 grow">
            <div className="row gap-8">
              <span style={{ fontWeight: 500 }}>{holding.name}</span>
              <TypeChip type={holding.asset_type} />
            </div>
            <div className="row gap-12 dim" style={{ fontSize: 11.5 }}>
              <span>Held <span className="num" style={{ color: "var(--ink)" }}>{holding.quantity}</span> units</span>
              <span>·</span>
              <span>Avg cost <span className="num" style={{ color: "var(--ink)" }}>{holding.avg_cost.toLocaleString()}</span> SAR</span>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="col">
            <label className="label">Quantity to sell</label>
            <div style={{ position: "relative" }}>
              <input className="input num" inputMode="decimal" value={qty} onChange={e => setQty(e.target.value)} placeholder="0" autoFocus />
              <button onClick={() => setQty(holding.quantity.toString())}
                      style={{
                        position: "absolute", right: 6, top: 6,
                        padding: "4px 8px", fontSize: 10.5, letterSpacing: "0.06em",
                        textTransform: "uppercase", color: "var(--accent-ink)",
                        background: "var(--accent-soft)", borderRadius: 5, fontWeight: 500,
                      }}>Max</button>
            </div>
            <div className="dim" style={{ fontSize: 11, marginTop: 4 }}>Max {holding.quantity} units</div>
          </div>
          <div className="col">
            <label className="label">Sell price</label>
            <div className="row gap-0">
              <input className="input num" inputMode="decimal"
                     value={price} onChange={e => setPrice(e.target.value)}
                     placeholder="0.00"
                     style={{ borderRadius: "7px 0 0 7px", borderRight: "none", flex: 1 }} />
              <select value={currency} onChange={e => setCurrency(e.target.value)}
                      style={{
                        border: "1px solid var(--line)", borderRadius: "0 7px 7px 0",
                        background: "var(--paper-2)", padding: "0 10px",
                        fontFamily: "Geist Mono, monospace", fontSize: 12,
                        color: "var(--accent-ink)", cursor: "pointer", minWidth: 70,
                      }}>
                {Object.keys(CURRENCY_RATES).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {currency !== "SAR" && priceN > 0 && (
              <div className="mono dim" style={{ fontSize: 11, marginTop: 4 }}>
                = {VAULT_DATA.fmt.SAR(sarPrice, { decimals: 2 })} SAR (× {fx})
              </div>
            )}
            <div className="dim" style={{ fontSize: 11, marginTop: 4 }}>
              Avg cost: {holding.avg_cost.toLocaleString()} SAR
            </div>
          </div>
          <div className="col">
            <label className="label">Sell date</label>
            <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
        </div>

        {apiError && (
          <div style={{ padding: "8px 12px", background: "var(--loss-soft)", border: "1px solid var(--loss)", borderRadius: 8, color: "var(--loss)", fontSize: 12.5 }}>
            {apiError}
          </div>
        )}

        <div className="col gap-8" style={{ padding: 14, borderRadius: 10, background: "var(--paper-2)", border: "1px solid var(--line)" }}>
          {currency !== "SAR" && priceN > 0 && (
            <div className="row between">
              <span className="dim">{currency} → SAR (× {fx})</span>
              <span className="num">{priceN.toLocaleString()} → {VAULT_DATA.fmt.SAR(sarPrice, { decimals: 2 })} SAR</span>
            </div>
          )}
          <div className="row between"><span className="dim">Proceeds</span><span className="num">+{VAULT_DATA.fmt.SAR(proceeds, { decimals: 2 })} SAR</span></div>
          <div className="row between"><span className="dim">Cost basis</span><span className="num">−{VAULT_DATA.fmt.SAR(costBasis, { decimals: 2 })} SAR</span></div>
          <div className="hairline" />
          <div className="row between" style={{ fontWeight: 500 }}>
            <span>Realized P&L</span>
            <Delta value={realized} suffix=" SAR" />
          </div>
        </div>
      </div>
    </Modal>
  );
};

// ---- Capital Increase ----
const CapitalIncreaseModal = ({ open, onClose, holding, onConfirm }) => {
  const [newShares, setNewShares] = React.useState("");
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = React.useState(false);
  const [apiError, setApiError] = React.useState("");

  React.useEffect(() => { if (open) { setNewShares(""); setApiError(""); } }, [open]);

  if (!holding) return null;
  const n      = parseFloat(newShares) || 0;
  const newAvg = n > 0 ? (holding.quantity * holding.avg_cost) / (holding.quantity + n) : holding.avg_cost;
  const newQty = holding.quantity + n;

  const handleApply = async () => {
    setSubmitting(true);
    setApiError("");
    try {
      const r = await fetch("/api/portfolio/capital-increase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ holding_id: holding.id, new_shares: n, tx_date: date }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.detail || "Capital increase failed");
      }
      onConfirm && onConfirm({ holding, n, newAvg, newQty, date });
      onClose();
    } catch (err) {
      setApiError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose}
           eyebrow="Capital Increase"
           title={`Bonus shares — ${holding.name}`}
           footer={
             <div className="row between">
               <div className="dim" style={{ fontSize: 12, maxWidth: 220 }}>
                 Bonus shares lower your average cost without changing your total invested.
               </div>
               <div className="row gap-8">
                 <button className="btn" onClick={onClose}>Cancel</button>
                 <button className="btn primary" disabled={n <= 0 || submitting} onClick={handleApply}>
                   {submitting ? <span className="dots"><span></span><span></span><span></span></span> : "Apply"}
                 </button>
               </div>
             </div>
           }>
      <div className="col gap-16">
        <div className="row gap-12" style={{ padding: 12, background: "var(--paper-2)", borderRadius: 10, border: "1px solid var(--line)" }}>
          <Icon name="gift" size={20} style={{ color: "var(--accent)" }} />
          <div className="col gap-4 grow">
            <div style={{ fontSize: 13 }}>{holding.name}</div>
            <div className="dim" style={{ fontSize: 11.5 }}>
              Current: <span className="num" style={{ color: "var(--ink)" }}>{holding.quantity}</span> units @ <span className="num" style={{ color: "var(--ink)" }}>{holding.avg_cost.toLocaleString()}</span> avg
            </div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="col">
            <label className="label">Bonus shares received</label>
            <input className="input num" inputMode="decimal" value={newShares} onChange={e => setNewShares(e.target.value)} placeholder="0" autoFocus />
          </div>
          <div className="col">
            <label className="label">Effective date</label>
            <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
        </div>
        {n > 0 && (
          <div className="col gap-8" style={{ padding: 14, borderRadius: 10, background: "var(--paper-2)", border: "1px solid var(--line)" }}>
            <div className="eyebrow">Result</div>
            <div className="row between"><span className="dim">Quantity</span><span className="num">{holding.quantity} → <strong>{newQty}</strong></span></div>
            <div className="row between"><span className="dim">Avg cost</span><span className="num">{holding.avg_cost.toFixed(2)} → <strong style={{ color: "var(--gain)" }}>{newAvg.toFixed(2)}</strong></span></div>
            <div className="row between"><span className="dim">Total invested</span><span className="num">unchanged</span></div>
          </div>
        )}
        {apiError && (
          <div style={{ padding: "8px 12px", background: "var(--loss-soft)", border: "1px solid var(--loss)", borderRadius: 8, color: "var(--loss)", fontSize: 12.5 }}>
            {apiError}
          </div>
        )}
      </div>
    </Modal>
  );
};

// ---- Cash (Deposit / Withdraw) ----
const CashModal = ({ open, onClose, kind = "deposit", balance, onConfirm }) => {
  const [amount, setAmount] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [apiError, setApiError] = React.useState("");

  React.useEffect(() => { if (open) { setAmount(""); setNotes(""); setApiError(""); } }, [open, kind]);

  const n      = parseFloat(amount) || 0;
  const valid  = n > 0 && (kind === "deposit" || n <= balance);
  const newBal = kind === "deposit" ? balance + n : balance - n;

  const handleConfirm = async () => {
    setSubmitting(true);
    setApiError("");
    try {
      const endpoint = kind === "deposit" ? "/api/cash/deposit" : "/api/cash/withdraw";
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ amount: n, notes: notes || null }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.detail || `${kind === "deposit" ? "Deposit" : "Withdrawal"} failed`);
      }
      onConfirm && onConfirm({ kind, amount: n, notes });
      onClose();
    } catch (err) {
      setApiError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose}
           eyebrow={kind === "deposit" ? "Cash Deposit" : "Cash Withdrawal"}
           title={kind === "deposit" ? "Deposit funds" : "Withdraw funds"}
           footer={
             <div className="row between">
               <div className="col" style={{ fontSize: 12 }}>
                 <div className="dim">New cash balance</div>
                 <div className="serif num" style={{ fontSize: 22, lineHeight: 1.1 }}>
                   {VAULT_DATA.fmt.SAR(newBal, { decimals: 2 })} <span style={{ fontFamily: "Geist", fontSize: 11, color: "var(--ink-2)" }}>SAR</span>
                 </div>
               </div>
               <div className="row gap-8">
                 <button className="btn" onClick={onClose}>Cancel</button>
                 <button className={`btn ${kind === "deposit" ? "gold" : "primary"}`}
                         disabled={!valid || submitting}
                         onClick={handleConfirm}>
                   {submitting
                     ? <span className="dots"><span></span><span></span><span></span></span>
                     : kind === "deposit" ? "Confirm deposit" : "Confirm withdrawal"}
                 </button>
               </div>
             </div>
           }>
      <div className="col gap-16">
        <div className="row gap-12" style={{ padding: 12, background: "var(--paper-2)", borderRadius: 10, border: "1px solid var(--line)" }}>
          <Icon name="wallet" size={20} style={{ color: "var(--accent)" }} />
          <div className="col gap-4 grow">
            <div className="dim" style={{ fontSize: 11.5 }}>Current cash balance</div>
            <div className="serif num" style={{ fontSize: 20, lineHeight: 1 }}>
              {VAULT_DATA.fmt.SAR(balance, { decimals: 2 })} <span style={{ fontFamily: "Geist", fontSize: 11, color: "var(--ink-2)" }}>SAR</span>
            </div>
          </div>
        </div>
        <div className="col">
          <label className="label">Amount (SAR)</label>
          <input className="input num" style={{ fontSize: 18, padding: "14px 12px" }} inputMode="decimal"
                 value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" autoFocus />
          {kind === "withdraw" && n > balance && (
            <div className="delta down" style={{ fontSize: 12, marginTop: 6 }}>
              <span className="arrow">▼</span> Insufficient balance.
            </div>
          )}
          <div className="row gap-6" style={{ marginTop: 8 }}>
            {[1000, 5000, 10000, 25000].map(v => (
              <button key={v} className="btn xs" onClick={() => setAmount(v.toString())}>+{v.toLocaleString()}</button>
            ))}
          </div>
        </div>
        <div className="col">
          <label className="label">Notes (optional)</label>
          <input className="input" value={notes} onChange={e => setNotes(e.target.value)}
                 placeholder={kind === "deposit" ? "Monthly contribution" : "Personal withdrawal"} />
        </div>
        {apiError && (
          <div style={{ padding: "8px 12px", background: "var(--loss-soft)", border: "1px solid var(--loss)", borderRadius: 8, color: "var(--loss)", fontSize: 12.5 }}>
            {apiError}
          </div>
        )}
      </div>
    </Modal>
  );
};

// ---- AI Chat Drawer ----
const ChatDrawer = ({ open, onClose, summary }) => {
  const [messages, setMessages] = React.useState([
    { role: "ai", content: "Hello! I can see your portfolio data. Ask me anything about your holdings, performance, or what to do next." },
  ]);
  const [input, setInput] = React.useState("");
  const [typing, setTyping] = React.useState(false);
  const [provider, setProvider] = React.useState("claude");
  const scrollRef = React.useRef(null);

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, typing]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const suggested = [
    "Why is my portfolio down vs yesterday?",
    "Which holding is dragging the most?",
    "What's my exposure to Saudi stocks?",
    "Suggest a rebalance for risk.",
  ];

  const send = async (text) => {
    const q = (text ?? input).trim();
    if (!q) return;

    // Snapshot current history before updating state (used in API call)
    const historySnapshot = messages
      .filter(m => m.role === "user" || m.role === "ai")
      .map(m => ({ role: m.role === "ai" ? "assistant" : "user", content: m.content }));

    setMessages(m => [...m, { role: "user", content: q }]);
    setInput("");
    setTyping(true);
    try {
      const r = await fetch("/api/chat/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          messages: [...historySnapshot, { role: "user", content: q }],
          provider,
        }),
      });
      if (r.ok) {
        const d = await r.json();
        setMessages(m => [...m, { role: "ai", content: d.reply || d.message || "…" }]);
      } else {
        throw new Error("AI unavailable");
      }
    } catch (_) {
      // Fallback to contextual mock response
      const fallback = `Based on your portfolio: unrealized P&L is ${VAULT_DATA.fmt.SAR(summary.unrealized_pnl, { decimals: 0 })} SAR across ${summary.positions_count} positions. Cash on hand is ${VAULT_DATA.fmt.SAR(summary.cash_balance, { decimals: 0 })} SAR. Want me to drill into a specific holding?`;
      setMessages(m => [...m, { role: "ai", content: fallback }]);
    } finally {
      setTyping(false);
    }
  };

  if (!open) return null;
  return (
    <>
      <div className="scrim" style={{ background: "rgba(10, 18, 36, 0.18)" }} onClick={onClose} />
      <aside className="drawer">
        <div className="row between" style={{ padding: "14px 18px", borderBottom: "1px solid var(--line)" }}>
          <div className="row gap-10">
            <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--ink)", color: "var(--accent-2)", display: "grid", placeItems: "center" }}>
              <Icon name="sparkle" size={16} />
            </div>
            <div className="col gap-4">
              <div className="serif" style={{ fontSize: 17, lineHeight: 1 }}>Vault AI</div>
              <div className="dim" style={{ fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase" }}>Your portfolio, in context</div>
            </div>
          </div>
          <div className="row gap-6">
            <select value={provider} onChange={e => setProvider(e.target.value)}
                    style={{ padding: "4px 8px", fontSize: 11, border: "1px solid var(--line)", borderRadius: 6, background: "var(--paper-2)", fontFamily: "Geist Mono, monospace" }}>
              <option value="claude">claude-haiku-4-5</option>
              <option value="openai">gpt-4o-mini</option>
            </select>
            <button className="btn ghost" onClick={onClose} style={{ padding: 6 }}>
              <Icon name="close" size={16} />
            </button>
          </div>
        </div>

        <div ref={scrollRef} className="col gap-12" style={{ flex: 1, overflow: "auto", padding: 18 }}>
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "bubble-user" : "bubble-ai"}>{m.content}</div>
          ))}
          {typing && <div className="bubble-ai dots dim"><span></span><span></span><span></span></div>}
          {messages.length === 1 && !typing && (
            <div className="col gap-6" style={{ marginTop: 12 }}>
              <div className="eyebrow">Suggested</div>
              {suggested.map(s => (
                <button key={s} onClick={() => send(s)}
                        style={{ textAlign: "left", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--paper-2)", fontSize: 12.5, color: "var(--ink)" }}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: 14, borderTop: "1px solid var(--line)" }}>
          <div className="row gap-8" style={{ alignItems: "flex-end" }}>
            <textarea className="input" rows="1" style={{ resize: "none", paddingRight: 12 }}
                      placeholder="Ask about your portfolio…"
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
            <button className="btn primary" style={{ padding: 10 }} onClick={() => send()}>
              <Icon name="send" size={14} />
            </button>
          </div>
          <div className="dim" style={{ fontSize: 10.5, marginTop: 6, textAlign: "center" }}>
            Vault AI sees your live holdings, last 10 transactions, and recent snapshots.
          </div>
        </div>
      </aside>
    </>
  );
};

// ---- Update Current Price (manual assets: Fund, Bond, Real Estate, etc.) ----
const UpdatePriceModal = ({ open, onClose, holding, onConfirm }) => {
  const isFund = holding?.asset_type === "Fund";
  const [value, setValue]       = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [apiError, setApiError] = React.useState("");

  React.useEffect(() => {
    if (open && holding) {
      setValue(holding.current_price?.toString() || "");
      setApiError("");
    }
  }, [open, holding]);

  const valueN    = parseFloat(value) || 0;
  const invested  = (holding?.quantity || 1) * (holding?.avg_cost || 0);
  const newTotal  = (holding?.quantity || 1) * valueN;
  const pnl       = newTotal - invested;
  const canSubmit = valueN > 0 && !submitting;

  const handleConfirm = async () => {
    setSubmitting(true);
    setApiError("");
    try {
      const r = await fetch(`/api/portfolio/holdings/${holding.id}/price`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ current_price: valueN }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.detail || "Update failed");
      }
      onConfirm && onConfirm({ holding, newPrice: valueN });
      onClose();
    } catch (err) {
      setApiError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose}
           eyebrow={`Update · ${holding?.asset_type || "Holding"}`}
           title={holding?.name || "Update price"}
           footer={(
             <div className="row between">
               <div className="col" style={{ fontSize: 12 }}>
                 <div className="dim">{isFund ? "New total value" : "New current price"}</div>
                 <div className="serif num" style={{ fontSize: 22, lineHeight: 1.1 }}>
                   {VAULT_DATA.fmt.SAR(newTotal, { decimals: 2 })}
                   <span style={{ fontFamily: "Geist", fontSize: 11, color: "var(--ink-2)", marginLeft: 6 }}>SAR</span>
                 </div>
               </div>
               <div className="row gap-8">
                 <button className="btn" onClick={onClose}>Cancel</button>
                 <button className="btn gold" disabled={!canSubmit} onClick={handleConfirm}>
                   {submitting ? <span className="dots"><span></span><span></span><span></span></span> : "Update"}
                 </button>
               </div>
             </div>
           )}>
      <div className="col gap-16">
        <div className="col gap-6">
          <label className="label">{isFund ? "Current fund value (SAR)" : "New price per unit (SAR)"}</label>
          <input className="input num" inputMode="decimal" autoFocus
                 value={value} onChange={e => setValue(e.target.value)}
                 placeholder={isFund ? "e.g. 4100" : "0.00"} />
          {isFund && (
            <div className="dim" style={{ fontSize: 11.5 }}>
              Enter the total current value of this fund position as reported by your fund manager.
            </div>
          )}
        </div>

        <div className="col gap-8" style={{ padding: 14, borderRadius: 10, background: "var(--paper-2)", border: "1px solid var(--line)" }}>
          <div className="row between">
            <span className="dim">Amount invested</span>
            <span className="num">{VAULT_DATA.fmt.SAR(invested, { decimals: 2 })} SAR</span>
          </div>
          <div className="row between">
            <span className="dim">{isFund ? "New value" : "New market value"}</span>
            <span className="num">{VAULT_DATA.fmt.SAR(newTotal, { decimals: 2 })} SAR</span>
          </div>
          <div className="hairline" />
          <div className="row between" style={{ fontWeight: 500 }}>
            <span className="dim">Unrealized P&L</span>
            <span className={`num delta ${pnl >= 0 ? "up" : "down"}`}>
              {pnl >= 0 ? "+" : ""}{VAULT_DATA.fmt.SAR(pnl, { decimals: 2 })} SAR
            </span>
          </div>
        </div>

        {apiError && (
          <div style={{ padding: "8px 12px", background: "var(--loss-soft)", border: "1px solid var(--loss)", borderRadius: 8, color: "var(--loss)", fontSize: 12.5 }}>
            {apiError}
          </div>
        )}
      </div>
    </Modal>
  );
};

// ---- Fund Flow (wallet-style add / withdraw for Fund holdings) ----
// A Fund is stored as quantity=1, where current_price = total value and
// avg_cost = total contributed basis. Adding/withdrawing money moves it between
// the cash wallet and the fund value WITHOUT the share-buy averaging that would
// otherwise crater the value. See POST /api/portfolio/fund-flow.
const FundFlowModal = ({ open, onClose, holding, cashBalance = 0, onConfirm }) => {
  const [direction, setDirection] = React.useState("ADD");
  const [amount, setAmount]       = React.useState("");
  const [date, setDate]           = React.useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes]         = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [apiError, setApiError]   = React.useState("");

  React.useEffect(() => {
    if (open) {
      setDirection("ADD"); setAmount(""); setNotes(""); setApiError("");
      setDate(new Date().toISOString().slice(0, 10));
    }
  }, [open]);

  if (!holding) return null;

  const fmt      = VAULT_DATA.fmt;
  const isAdd    = direction === "ADD";
  const value    = (holding.quantity || 1) * (holding.current_price || 0);   // total market value
  const n        = parseFloat(amount) || 0;
  const newValue = isAdd ? value + n : value - n;
  const overCash = isAdd && n > cashBalance;
  const overVal  = !isAdd && n > value;
  const valid    = n > 0 && !overCash && !overVal && !submitting;

  const handleConfirm = async () => {
    setSubmitting(true);
    setApiError("");
    try {
      const r = await fetch("/api/portfolio/fund-flow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          holding_id: holding.id, amount: n, direction,
          tx_date: date, notes: notes || null,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.detail || "Fund update failed");
      }
      onConfirm && onConfirm({ holding, direction, amount: n, newValue });
      onClose();
    } catch (err) {
      setApiError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const segBtn = (dir, label) => (
    <button onClick={() => setDirection(dir)}
            style={{
              flex: 1, padding: "8px 0", fontSize: 12.5, fontWeight: 500,
              borderRadius: 7, textAlign: "center",
              background: direction === dir ? "var(--accent-soft)" : "transparent",
              color: direction === dir ? "var(--accent-ink)" : "var(--ink-2)",
              border: direction === dir ? "1px solid var(--accent)" : "1px solid transparent",
            }}>
      {label}
    </button>
  );

  return (
    <Modal open={open} onClose={onClose}
           eyebrow={`Fund · ${holding.name}`}
           title={isAdd ? "Add money to fund" : "Withdraw from fund"}
           footer={(
             <div className="row between">
               <div className="col" style={{ fontSize: 12 }}>
                 <div className="dim">New fund value</div>
                 <div className="serif num" style={{ fontSize: 22, lineHeight: 1.1 }}>
                   {fmt.SAR(newValue >= 0 ? newValue : 0, { decimals: 2 })}
                   <span style={{ fontFamily: "Geist", fontSize: 11, color: "var(--ink-2)", marginLeft: 6 }}>SAR</span>
                 </div>
               </div>
               <div className="row gap-8">
                 <button className="btn" onClick={onClose}>Cancel</button>
                 <button className="btn gold" disabled={!valid} onClick={handleConfirm}>
                   {submitting ? <span className="dots"><span></span><span></span><span></span></span> : (isAdd ? "Add" : "Withdraw")}
                 </button>
               </div>
             </div>
           )}>
      <div className="col gap-16">
        <div className="row gap-6" style={{ padding: 4, background: "var(--paper-2)", border: "1px solid var(--line)", borderRadius: 9 }}>
          {segBtn("ADD", "Add money")}
          {segBtn("WITHDRAW", "Withdraw")}
        </div>

        <div className="col gap-6">
          <div className="row between" style={{ alignItems: "baseline" }}>
            <label className="label">Amount (SAR)</label>
            {!isAdd && value > 0 && (
              <button onClick={() => setAmount(String(value))}
                      style={{ fontSize: 11.5, color: "var(--accent-ink)", fontWeight: 500 }}>
                Withdraw all
              </button>
            )}
          </div>
          <input className="input num" inputMode="decimal" autoFocus
                 value={amount} onChange={e => setAmount(e.target.value)}
                 placeholder="e.g. 750" />
          <div className="dim" style={{ fontSize: 11.5 }}>
            {isAdd
              ? <>Cash available: <span className="num">{fmt.SAR(cashBalance, { decimals: 2 })} SAR</span></>
              : <>Current fund value: <span className="num">{fmt.SAR(value, { decimals: 2 })} SAR</span></>}
          </div>
          {overCash && <div className="dim" style={{ fontSize: 11.5, color: "var(--loss)" }}>Not enough cash — deposit funds first.</div>}
          {overVal  && <div className="dim" style={{ fontSize: 11.5, color: "var(--loss)" }}>Can't withdraw more than the fund's value.</div>}
          {!isAdd && value > 0 && parseFloat(amount) >= value && (
            <div className="dim" style={{ fontSize: 11.5, color: "var(--accent-ink)" }}>This empties the fund — the holding will be removed.</div>
          )}
        </div>

        <div className="col gap-8" style={{ padding: 14, borderRadius: 10, background: "var(--paper-2)", border: "1px solid var(--line)" }}>
          <div className="row between">
            <span className="dim">Fund value</span>
            <span className="num">{fmt.SAR(value, { decimals: 2 })} → <strong>{fmt.SAR(newValue >= 0 ? newValue : 0, { decimals: 2 })}</strong> SAR</span>
          </div>
          <div className="row between">
            <span className="dim">Cash wallet</span>
            <span className="num">{fmt.SAR(cashBalance, { decimals: 2 })} → <strong>{fmt.SAR((isAdd ? cashBalance - n : cashBalance + n), { decimals: 2 })}</strong> SAR</span>
          </div>
          <div className="hairline" />
          <div className="dim" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
            {isAdd
              ? "Contributing moves cash into the fund — no gain or loss is booked, and your total value is unchanged."
              : "Withdrawing moves value back to cash. Any gain on the withdrawn portion is booked as realized P&L."}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="col">
            <label className="label">Date</label>
            <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="col">
            <label className="label">Notes (optional)</label>
            <input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Monthly top-up…" />
          </div>
        </div>

        {apiError && (
          <div style={{ padding: "8px 12px", background: "var(--loss-soft)", border: "1px solid var(--loss)", borderRadius: 8, color: "var(--loss)", fontSize: 12.5 }}>
            {apiError}
          </div>
        )}
      </div>
    </Modal>
  );
};

Object.assign(window, { Modal, BuyModal, SellModal, CapitalIncreaseModal, CashModal, ChatDrawer, UpdatePriceModal, FundFlowModal });
