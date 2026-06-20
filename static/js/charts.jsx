// Custom SVG charts: line+area, sparkline, donut, stacked bar, bar pair.

// ---- Line/Area chart ----
const AreaChart = ({ data, height = 280, accent = "var(--accent)", showAxes = true, onHover }) => {
  const wrapRef = React.useRef(null);
  const [w, setW] = React.useState(960);
  const [hoverIdx, setHoverIdx] = React.useState(null);

  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setW(Math.floor(e.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!data || data.length === 0) return <div ref={wrapRef} style={{ height }} />;

  const padL = 12, padR = 12, padT = 18, padB = showAxes ? 28 : 12;
  const innerW = Math.max(10, w - padL - padR);
  const innerH = Math.max(10, height - padT - padB);

  const values = data.map(d => d.value);
  let min = Math.min(...values), max = Math.max(...values);
  const range = (max - min) || 1;
  min -= range * 0.05; max += range * 0.05;

  const x = i => padL + (i / (data.length - 1)) * innerW;
  const y = v => padT + (1 - (v - min) / (max - min)) * innerH;

  // Smooth path via Catmull-Rom-ish
  const linePath = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(d.value).toFixed(2)}`).join(" ");
  const areaPath = `${linePath} L${x(data.length - 1).toFixed(2)},${(padT + innerH).toFixed(2)} L${x(0).toFixed(2)},${(padT + innerH).toFixed(2)} Z`;

  // Y axis tick values
  const ticks = 4;
  const tickVals = Array.from({ length: ticks + 1 }, (_, i) => min + (max - min) * (i / ticks));

  // X axis label positions
  const xLabels = (() => {
    if (data.length < 2) return [];
    const n = Math.min(6, data.length);
    return Array.from({ length: n }, (_, i) => Math.round((data.length - 1) * (i / (n - 1))));
  })();

  const fmtMoney = v => {
    if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
    if (v >= 1e3) return Math.round(v / 1e3) + "K";
    return Math.round(v).toString();
  };
  const fmtDate = (s, range = "long") => {
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleDateString("en-US", range === "short" ? { month: "short", day: "numeric" } : { month: "short", year: "2-digit" });
  };

  const handleMove = e => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const rel = (mx - padL) / innerW;
    const idx = Math.round(Math.min(1, Math.max(0, rel)) * (data.length - 1));
    setHoverIdx(idx);
    onHover && onHover(data[idx], idx);
  };
  const handleLeave = () => { setHoverIdx(null); onHover && onHover(null); };

  const id = React.useMemo(() => "g" + Math.random().toString(36).slice(2, 8), []);

  const last = data[data.length - 1];
  const first = data[0];
  const totalChange = last.value - first.value;
  const totalChangePct = (totalChange / first.value) * 100;

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%" }}>
      <svg width={w} height={height} style={{ display: "block" }}
           onMouseMove={handleMove} onMouseLeave={handleLeave}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.22" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* horizontal grid */}
        {tickVals.map((v, i) => (
          <line key={i} x1={padL} x2={w - padR} y1={y(v)} y2={y(v)}
                stroke="var(--line-2)" strokeDasharray={i === 0 || i === ticks ? "0" : "3 4"} strokeWidth="1" />
        ))}
        {/* axis labels */}
        {showAxes && tickVals.map((v, i) => (
          <text key={"yt" + i} x={w - padR} y={y(v) - 4} textAnchor="end"
                style={{ fontFamily: "Geist Mono, monospace", fontSize: 10, fill: "var(--ink-3)" }}>
            {fmtMoney(v)}
          </text>
        ))}
        {showAxes && xLabels.map(i => (
          <text key={"xt" + i} x={x(i)} y={height - 8} textAnchor="middle"
                style={{ fontFamily: "Geist Mono, monospace", fontSize: 10, fill: "var(--ink-3)" }}>
            {fmtDate(data[i].date, data.length > 60 ? "long" : "short")}
          </text>
        ))}
        {/* area + line */}
        <path d={areaPath} fill={`url(#${id})`} />
        <path d={linePath} fill="none" stroke={accent} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
        {/* hover */}
        {hoverIdx != null && (
          <g pointerEvents="none">
            <line x1={x(hoverIdx)} x2={x(hoverIdx)} y1={padT} y2={padT + innerH} stroke="var(--ink)" strokeOpacity="0.25" strokeDasharray="3 3" />
            <circle cx={x(hoverIdx)} cy={y(data[hoverIdx].value)} r="5" fill="var(--paper)" stroke={accent} strokeWidth="2" />
          </g>
        )}
        {/* end dot */}
        <circle cx={x(data.length - 1)} cy={y(last.value)} r="3.5" fill={accent} />
        <circle cx={x(data.length - 1)} cy={y(last.value)} r="7" fill={accent} fillOpacity="0.18" />
      </svg>

      {hoverIdx != null && (
        <div style={{
          position: "absolute",
          left: Math.min(w - 200, Math.max(8, ((hoverIdx / (data.length - 1)) * innerW) + padL - 100)),
          top: 8,
          background: "var(--ink)", color: "#f5efe0",
          padding: "8px 12px", borderRadius: 8,
          fontSize: 12, lineHeight: 1.4,
          pointerEvents: "none",
          boxShadow: "var(--shadow-md)",
          fontVariantNumeric: "tabular-nums",
        }}>
          <div style={{ opacity: 0.6, fontSize: 11, fontFamily: "Geist Mono, monospace" }}>{data[hoverIdx].date}</div>
          <div style={{ fontFamily: "Instrument Serif, serif", fontSize: 20, lineHeight: 1.1, marginTop: 2 }}>
            {VAULT_DATA.fmt.SAR(data[hoverIdx].value, { decimals: 0 })}
            <span style={{ fontFamily: "Geist", fontSize: 11, marginLeft: 4, opacity: 0.6 }}>SAR</span>
          </div>
        </div>
      )}
    </div>
  );
};

// ---- Sparkline ----
const Sparkline = ({ data, width = 80, height = 28, color }) => {
  if (!data || data.length < 2) return <div style={{ width, height }} />;
  const values = data;
  const min = Math.min(...values), max = Math.max(...values);
  const range = (max - min) || 1;
  const path = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (width - 2) + 1;
    const y = height - 1 - ((v - min) / range) * (height - 2);
    return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
  const last = values[values.length - 1], first = values[0];
  const up = last >= first;
  const c = color || (up ? "var(--gain)" : "var(--loss)");
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <path d={path} fill="none" stroke={c} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
};

// ---- Donut chart ----
const Donut = ({ data, size = 220, thickness = 28, colors }) => {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = size / 2 - thickness / 2;
  const c = 2 * Math.PI * r;
  let off = 0;
  const palette = colors || ["var(--accent)", "var(--ink)", "#7c3aed", "#0e7490", "#a16207", "#475569"];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>
      <g transform={`translate(${size / 2}, ${size / 2}) rotate(-90)`}>
        {data.map((d, i) => {
          const len = (d.value / total) * c;
          const arc = (
            <circle key={i}
                    r={r} fill="none"
                    stroke={palette[i % palette.length]}
                    strokeWidth={thickness}
                    strokeDasharray={`${len} ${c}`}
                    strokeDashoffset={-off}
                    strokeLinecap="butt" />
          );
          off += len;
          return arc;
        })}
      </g>
    </svg>
  );
};

// ---- Stacked horizontal bars (allocation history) ----
const StackedBars = ({ months, types, colors, height = 220, formatX }) => {
  const wrapRef = React.useRef(null);
  const [w, setW] = React.useState(720);
  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setW(Math.floor(e.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const padL = 8, padR = 8, padT = 8, padB = 22;
  const innerW = w - padL - padR;
  const innerH = height - padT - padB;
  const barW = innerW / months.length * 0.62;
  const gap = innerW / months.length;

  const palette = colors || ["var(--accent)", "var(--ink)", "#7c3aed", "#0e7490", "#a16207", "#475569"];

  return (
    <div ref={wrapRef} style={{ width: "100%" }}>
      <svg width={w} height={height} style={{ display: "block" }}>
        {months.map((m, i) => {
          const total = types.reduce((s, t) => s + (m[t] || 0), 0);
          let yCursor = padT + innerH;
          const x = padL + i * gap + (gap - barW) / 2;
          return (
            <g key={i}>
              {types.map((t, j) => {
                const v = m[t] || 0;
                const h = (v / total) * innerH;
                yCursor -= h;
                return (
                  <rect key={j} x={x} y={yCursor} width={barW} height={h}
                        fill={palette[j % palette.length]}
                        rx={j === types.length - 1 ? 2 : 0} />
                );
              })}
              <text x={x + barW / 2} y={height - 6} textAnchor="middle"
                    style={{ fontFamily: "Geist Mono, monospace", fontSize: 10, fill: "var(--ink-3)" }}>
                {formatX ? formatX(m.month) : m.month.slice(2)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// ---- Paired bar chart (e.g. buys vs sells per month) ----
const PairedBars = ({ data, keys = ["a", "b"], colors = ["var(--accent)", "var(--ink)"], height = 200, formatX, formatY }) => {
  const wrapRef = React.useRef(null);
  const [w, setW] = React.useState(720);
  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setW(Math.floor(e.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const padL = 30, padR = 8, padT = 8, padB = 24;
  const innerW = Math.max(20, w - padL - padR);
  const innerH = height - padT - padB;
  const groupW = innerW / data.length;
  const barW = Math.min(14, groupW * 0.34);
  const max = Math.max(1, ...data.flatMap(d => keys.map(k => d[k] || 0)));

  return (
    <div ref={wrapRef} style={{ width: "100%" }}>
      <svg width={w} height={height} style={{ display: "block" }}>
        {/* baseline */}
        <line x1={padL} x2={w - padR} y1={padT + innerH} y2={padT + innerH} stroke="var(--line)" />
        {[0.25, 0.5, 0.75, 1].map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={w - padR} y1={padT + innerH * (1 - t)} y2={padT + innerH * (1 - t)}
                  stroke="var(--line-2)" strokeDasharray="2 4" />
            <text x={padL - 6} y={padT + innerH * (1 - t) + 3} textAnchor="end"
                  style={{ fontFamily: "Geist Mono, monospace", fontSize: 10, fill: "var(--ink-3)" }}>
              {formatY ? formatY(max * t) : Math.round(max * t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = padL + i * groupW + groupW / 2;
          return (
            <g key={i}>
              {keys.map((k, j) => {
                const v = d[k] || 0;
                const h = (v / max) * innerH;
                const x = cx - (keys.length * barW + (keys.length - 1) * 2) / 2 + j * (barW + 2);
                return (
                  <rect key={j} x={x} y={padT + innerH - h} width={barW} height={h} rx="2"
                        fill={colors[j % colors.length]} />
                );
              })}
              <text x={cx} y={height - 6} textAnchor="middle"
                    style={{ fontFamily: "Geist Mono, monospace", fontSize: 10, fill: "var(--ink-3)" }}>
                {formatX ? formatX(d) : (d.label || d.month?.slice(-2))}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// ---- Range Selector ----
const RangeSelector = ({ value, onChange, ranges = ["1D", "1W", "1M", "3M", "YTD", "1Y", "Max"] }) => (
  <div className="row" style={{ background: "var(--paper-2)", border: "1px solid var(--line)", borderRadius: 8, padding: 2, gap: 0 }}>
    {ranges.map(r => (
      <button key={r}
              onClick={() => onChange(r)}
              style={{
                padding: "5px 10px",
                fontSize: 11.5,
                fontFamily: "Geist Mono, monospace",
                letterSpacing: "0.04em",
                borderRadius: 6,
                color: value === r ? "var(--ink)" : "var(--ink-3)",
                background: value === r ? "var(--paper)" : "transparent",
                boxShadow: value === r ? "0 1px 2px rgba(0,0,0,.06)" : "none",
                fontWeight: 500,
              }}>{r}</button>
    ))}
  </div>
);

// ---- TWR dual-line chart ----
// series: [{ label, values: [number], color, dash? }]
// xLabels: [string]  (same length as values)
const TwrChart = ({ series, xLabels, height = 260, yLabel = "" }) => {
  const wrapRef = React.useRef(null);
  const [w, setW] = React.useState(900);
  const [hover, setHover] = React.useState(null);

  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(e => setW(Math.floor(e[0].contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!series || series.length === 0 || !xLabels || xLabels.length < 2)
    return <div ref={wrapRef} style={{ height }} />;

  const pad = { t: 16, r: 20, b: 36, l: 44 };
  const iw = w - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const n = xLabels.length;

  const allVals = series.flatMap(s => s.values);
  const minV = Math.min(...allVals);
  const maxV = Math.max(...allVals);
  const span = maxV - minV || 1;

  const px = i => pad.l + (i / (n - 1)) * iw;
  const py = v => pad.t + ih - ((v - minV) / span) * ih;

  const path = (vals) =>
    vals.map((v, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(" ");

  // Y axis ticks
  const nTicks = 5;
  const ticks = Array.from({ length: nTicks }, (_, i) => minV + (i / (nTicks - 1)) * span);

  // X axis: thin out labels
  const xStep = Math.max(1, Math.floor(n / 8));
  const xTicks = xLabels.map((l, i) => ({ l, i })).filter(({ i }) => i % xStep === 0 || i === n - 1);

  // Tooltip crosshair
  const hitW = iw / (n - 1);

  return (
    <div ref={wrapRef} style={{ position: "relative", userSelect: "none" }}>
      <svg width={w} height={height} style={{ display: "block", overflow: "visible" }}
        onMouseMove={e => {
          const rect = wrapRef.current.getBoundingClientRect();
          const mx = e.clientX - rect.left - pad.l;
          const idx = Math.max(0, Math.min(n - 1, Math.round(mx / (iw / (n - 1)))));
          setHover(idx);
        }}
        onMouseLeave={() => setHover(null)}
      >
        {/* Grid + y-axis labels */}
        {ticks.map((v, i) => {
          const y = py(v);
          return (
            <g key={i}>
              <line x1={pad.l} x2={pad.l + iw} y1={y} y2={y} stroke="var(--line)" strokeWidth={0.5} />
              <text x={pad.l - 6} y={y + 4} textAnchor="end" fill="var(--ink-3)"
                    style={{ fontSize: 10, fontFamily: "monospace" }}>{v.toFixed(1)}</text>
            </g>
          );
        })}

        {/* x-axis labels */}
        {xTicks.map(({ l, i }) => (
          <text key={i} x={px(i)} y={pad.t + ih + 18} textAnchor="middle" fill="var(--ink-3)"
                style={{ fontSize: 10, fontFamily: "monospace" }}>{l}</text>
        ))}

        {/* y-axis label */}
        {yLabel && (
          <text transform={`translate(12,${pad.t + ih / 2}) rotate(-90)`} textAnchor="middle"
                fill="var(--ink-3)" style={{ fontSize: 9, fontFamily: "monospace" }}>{yLabel}</text>
        )}

        {/* Series lines */}
        {series.map((s, si) => (
          <path key={si} d={path(s.values)} fill="none" stroke={s.color}
                strokeWidth={s.dash ? 1.5 : 2}
                strokeDasharray={s.dash ? "5,4" : undefined}
                strokeLinecap="round" strokeLinejoin="round" />
        ))}

        {/* Reference line at 100 */}
        {minV <= 100 && maxV >= 100 && (
          <line x1={pad.l} x2={pad.l + iw} y1={py(100)} y2={py(100)}
                stroke="var(--ink-3)" strokeWidth={0.5} strokeDasharray="2,4" />
        )}

        {/* Crosshair */}
        {hover !== null && (
          <>
            <line x1={px(hover)} x2={px(hover)} y1={pad.t} y2={pad.t + ih}
                  stroke="var(--ink-3)" strokeWidth={1} />
            {series.map((s, si) => (
              <circle key={si} cx={px(hover)} cy={py(s.values[hover])} r={3.5}
                      fill={s.color} stroke="var(--bg)" strokeWidth={1.5} />
            ))}
          </>
        )}
      </svg>

      {/* Tooltip */}
      {hover !== null && (
        <div style={{
          position: "absolute",
          top: pad.t,
          left: Math.min(px(hover) + 12, w - 180),
          background: "#000",
          border: "1px solid var(--line)",
          padding: "8px 12px",
          fontSize: 11,
          fontFamily: "monospace",
          pointerEvents: "none",
          whiteSpace: "nowrap",
          zIndex: 10,
        }}>
          <div style={{ color: "var(--ink-2)", marginBottom: 4 }}>{xLabels[hover]}</div>
          {series.map((s, si) => (
            <div key={si} style={{ color: s.color, marginBottom: 2 }}>
              {s.label}: {s.values[hover].toFixed(1)}
              {si === 1 && <span style={{ color: "var(--ink-3)" }}> ({s.values[hover] >= 100 ? "+" : ""}{(s.values[hover] - 100).toFixed(2)}%)</span>}
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="row gap-16" style={{ marginTop: 12, justifyContent: "flex-end", paddingRight: pad.r }}>
        {series.map((s, i) => (
          <div key={i} className="row gap-6" style={{ fontSize: 11, color: "var(--ink-3)", alignItems: "center" }}>
            <svg width={20} height={8}>
              <line x1={0} y1={4} x2={20} y2={4} stroke={s.color} strokeWidth={s.dash ? 1.5 : 2}
                    strokeDasharray={s.dash ? "5,4" : undefined} />
            </svg>
            {s.label}
          </div>
        ))}
      </div>
    </div>
  );
};

Object.assign(window, { AreaChart, Sparkline, Donut, StackedBars, PairedBars, RangeSelector, TwrChart });
