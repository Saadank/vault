// Auth — Login + Register, wired to /api/auth/* endpoints.

const AuthShell = ({ children, route, setRoute }) => (
  <div style={{ minHeight: "100vh", display: "grid", gridTemplateColumns: "1.05fr 1fr", background: "var(--bg)" }}>
    {/* Left brand panel */}
    <div style={{
      background: "var(--ink)",
      color: "#f5efe0",
      padding: "48px 56px",
      display: "flex", flexDirection: "column",
      position: "relative",
      overflow: "hidden",
    }}>
      <svg width="640" height="640" style={{ position: "absolute", right: -180, bottom: -200, opacity: 0.16 }}>
        <defs>
          <linearGradient id="auth-arc" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--accent-2)" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <circle cx="320" cy="320" r="260" fill="none" stroke="url(#auth-arc)" strokeWidth="1.2" />
        <circle cx="320" cy="320" r="200" fill="none" stroke="var(--accent-2)" strokeWidth="0.6" strokeDasharray="2 6" />
        <circle cx="320" cy="320" r="140" fill="none" stroke="var(--accent-2)" strokeWidth="0.6" strokeDasharray="2 6" />
      </svg>

      <div className="row gap-12">
        <Brandmark size={32} />
        <div className="serif" style={{ fontSize: 26, letterSpacing: "0.04em" }}>VAULT</div>
      </div>

      <div style={{ marginTop: "auto", maxWidth: 460, position: "relative", zIndex: 1 }}>
        <div className="eyebrow" style={{ color: "var(--accent-2)" }}>Private Portfolio · Established 2024</div>
        <h1 className="serif" style={{ fontSize: 56, lineHeight: 1.02, marginTop: 12 }}>
          Your wealth, accounted for.
          <span style={{ display: "block", fontStyle: "italic", color: "var(--accent-2)" }}>To the last halala.</span>
        </h1>
        <p style={{ marginTop: 18, fontSize: 14.5, lineHeight: 1.6, color: "#cfc6b0", maxWidth: 420 }}>
          A private investment ledger for the Saudi market and beyond. Tadawul, US equities, crypto, real
          estate — one quiet view, in SAR.
        </p>
        <div className="row gap-24" style={{ marginTop: 36 }}>
          <div className="col gap-4">
            <div className="serif" style={{ fontSize: 28 }}>1.04B<span className="muted" style={{ fontFamily: "Geist", fontSize: 11, marginLeft: 4 }}>SAR</span></div>
            <div style={{ fontSize: 11, color: "#a89e85", letterSpacing: "0.06em", textTransform: "uppercase" }}>Tracked across users</div>
          </div>
          <div style={{ width: 1, background: "#3a3322" }} />
          <div className="col gap-4">
            <div className="serif" style={{ fontSize: 28 }}>23</div>
            <div style={{ fontSize: 11, color: "#a89e85", letterSpacing: "0.06em", textTransform: "uppercase" }}>Asset classes</div>
          </div>
          <div style={{ width: 1, background: "#3a3322" }} />
          <div className="col gap-4">
            <div className="serif" style={{ fontSize: 28 }}>SAR</div>
            <div style={{ fontSize: 11, color: "#a89e85", letterSpacing: "0.06em", textTransform: "uppercase" }}>Native currency</div>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 36, fontSize: 11, color: "#7c7460", letterSpacing: "0.06em" }}>
        © 2026 VAULT · A Saudi private ledger
      </div>
    </div>

    {/* Right form panel */}
    <div style={{ display: "grid", placeItems: "center", padding: 48 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        {children}
        <div className="row center" style={{ marginTop: 28, fontSize: 12.5 }}>
          <span className="dim">{route === "login" ? "Don't have an account?" : "Already have one?"}&nbsp;</span>
          <button onClick={() => setRoute(route === "login" ? "register" : "login")}
                  style={{ color: "var(--accent-ink)", fontWeight: 500, borderBottom: "1px solid var(--accent)" }}>
            {route === "login" ? "Create an account" : "Sign in"}
          </button>
        </div>
      </div>
    </div>
  </div>
);

const LoginScreen = ({ onLogin, setRoute }) => {
  const [u, setU] = React.useState("");
  const [p, setP] = React.useState("");
  const [showP, setShowP] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  const submit = async (e) => {
    e?.preventDefault();
    if (!u || !p) return;
    setLoading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("username", u);
      fd.append("password", p);
      const r = await fetch("/api/auth/login", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.detail || "Incorrect username or password");
      }
      onLogin();
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <AuthShell route="login" setRoute={setRoute}>
      <div className="eyebrow" style={{ color: "var(--accent-ink)" }}>Sign in</div>
      <h2 className="serif" style={{ fontSize: 40, lineHeight: 1.1, marginTop: 4 }}>Welcome back.</h2>
      <p className="dim" style={{ marginTop: 6, fontSize: 13.5 }}>Enter your credentials to access your portfolio.</p>

      <form onSubmit={submit} className="col gap-12" style={{ marginTop: 24 }}>
        <div className="col">
          <label className="label">Username</label>
          <input className="input" value={u} onChange={e => setU(e.target.value)} placeholder="username" autoFocus />
        </div>
        <div className="col">
          <div className="row between">
            <label className="label">Password</label>
          </div>
          <div style={{ position: "relative" }}>
            <input className="input" type={showP ? "text" : "password"} value={p} onChange={e => setP(e.target.value)} placeholder="••••••••••" />
            <button type="button" onClick={() => setShowP(s => !s)}
                    style={{ position: "absolute", right: 8, top: 8, padding: 6, color: "var(--ink-3)" }}>
              <Icon name={showP ? "eyeOff" : "eye"} size={16} />
            </button>
          </div>
        </div>

        {error && (
          <div style={{ padding: "8px 12px", background: "var(--loss-soft)", border: "1px solid var(--loss)", borderRadius: 8, color: "var(--loss)", fontSize: 12.5 }}>
            {error}
          </div>
        )}

        <button type="submit" className="btn primary full" style={{ marginTop: 8, padding: "12px 14px" }} disabled={loading || !u || !p}>
          {loading ? <span className="dots"><span></span><span></span><span></span></span> : "Sign in"}
        </button>
      </form>

      <div className="row gap-12" style={{ marginTop: 18, alignItems: "center" }}>
        <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
        <span className="dim" style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase" }}>Secure access</span>
        <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
      </div>
      <div className="row gap-12" style={{ marginTop: 14, justifyContent: "center", fontSize: 11.5, color: "var(--ink-3)" }}>
        <span className="row gap-6"><Icon name="vault" size={13} /> JWT secured</span>
        <span>·</span>
        <span>HTTP-only cookie</span>
        <span>·</span>
        <span>bcrypt</span>
      </div>
    </AuthShell>
  );
};

const RegisterScreen = ({ onLogin, setRoute }) => {
  const [step, setStep] = React.useState(1);
  const [data, setData] = React.useState({ full: "", username: "", email: "", password: "" });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const set = (k, v) => setData(d => ({ ...d, [k]: v }));

  const handleCreate = async () => {
    setLoading(true);
    setError("");
    try {
      // Register
      const r = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          username: data.username,
          email: data.email,
          full_name: data.full,
          password: data.password,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.detail || "Registration failed");
      }
      // Auto-login
      const fd = new FormData();
      fd.append("username", data.username);
      fd.append("password", data.password);
      await fetch("/api/auth/login", { method: "POST", body: fd, credentials: "include" });
      onLogin();
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <AuthShell route="register" setRoute={setRoute}>
      <div className="row gap-8" style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-3)" }}>
        <span style={{ color: step >= 1 ? "var(--accent-ink)" : "var(--ink-3)" }}>● Identity</span>
        <span>—</span>
        <span style={{ color: step >= 2 ? "var(--accent-ink)" : "var(--ink-3)" }}>● Security</span>
      </div>
      <h2 className="serif" style={{ fontSize: 40, lineHeight: 1.1, marginTop: 8 }}>Open your VAULT.</h2>
      <p className="dim" style={{ marginTop: 6, fontSize: 13.5 }}>Takes under a minute. No payment, no third parties.</p>

      {step === 1 && (
        <div className="col gap-12" style={{ marginTop: 24 }}>
          <div className="col">
            <label className="label">Full name</label>
            <input className="input" value={data.full} onChange={e => set("full", e.target.value)} placeholder="Saad Al-Angari" autoFocus />
          </div>
          <div className="col">
            <label className="label">Username</label>
            <input className="input mono" value={data.username} onChange={e => set("username", e.target.value)} placeholder="saad" />
            <div className="dim" style={{ fontSize: 11, marginTop: 4 }}>Used to sign in. Lowercase, no spaces.</div>
          </div>
          <div className="col">
            <label className="label">Email</label>
            <input className="input" value={data.email} onChange={e => set("email", e.target.value)} placeholder="you@example.com" />
            <div className="dim" style={{ fontSize: 11, marginTop: 4 }}>Daily portfolio reports delivered here at 23:55 Asia/Riyadh.</div>
          </div>
          <button className="btn primary full" style={{ marginTop: 8, padding: "12px 14px" }}
                  onClick={() => setStep(2)}
                  disabled={!data.full || !data.username || !data.email}>
            Continue →
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="col gap-12" style={{ marginTop: 24 }}>
          <div className="col">
            <label className="label">Password</label>
            <input className="input" type="password" value={data.password}
                   onChange={e => set("password", e.target.value)}
                   placeholder="At least 10 characters" autoFocus />
            <div className="row gap-4" style={{ marginTop: 8 }}>
              {[0, 1, 2, 3].map(i => (
                <div key={i} style={{
                  flex: 1, height: 4, borderRadius: 2,
                  background: data.password.length > (i * 3) ? (i < 2 ? "var(--accent)" : "var(--gain)") : "var(--line)",
                }} />
              ))}
            </div>
          </div>

          <div className="col gap-6" style={{ padding: 12, background: "var(--paper-2)", borderRadius: 10, border: "1px solid var(--line)" }}>
            <div className="eyebrow">Account summary</div>
            <div className="row between"><span className="dim">Name</span><span>{data.full}</span></div>
            <div className="row between"><span className="dim">Username</span><span className="mono">{data.username}</span></div>
            <div className="row between"><span className="dim">Email</span><span>{data.email}</span></div>
            <div className="row between"><span className="dim">Cash balance</span><span className="num">0.00 SAR</span></div>
          </div>

          {error && (
            <div style={{ padding: "8px 12px", background: "var(--loss-soft)", border: "1px solid var(--loss)", borderRadius: 8, color: "var(--loss)", fontSize: 12.5 }}>
              {error}
            </div>
          )}

          <div className="row gap-8">
            <button className="btn" onClick={() => setStep(1)}>Back</button>
            <button className="btn primary grow" onClick={handleCreate} disabled={loading || !data.password}>
              {loading ? <span className="dots"><span></span><span></span><span></span></span> : "Create account"}
            </button>
          </div>
        </div>
      )}
    </AuthShell>
  );
};

Object.assign(window, { LoginScreen, RegisterScreen });
