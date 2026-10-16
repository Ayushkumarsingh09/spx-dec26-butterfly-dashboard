/* SPX 18-Dec-26 strike butterfly scenario lab.
   Slider state is the live scenario. Saved curves keep a snapshot of that state. */
(function () {
  const MathFly = window.FlyMath;
  const Chart = window.FlyChart;

  const DEF = {
    move: 0, sticky: "strike", shift: 0, skew: 0, curv: 0, pw: 0, cw: 0,
    wing: 100, range: 600, opt: "call", base: "market", flatvol: 12.87
  };
  const S = Object.assign({}, DEF);
  window.fxState = S;

  const COLORS = [
    "var(--cds-chart-categorical-1)",
    "var(--cds-chart-categorical-2)",
    "var(--cds-chart-categorical-3)",
    "var(--cds-chart-categorical-4)",
    "#c94f7c",
    "#7a8b2a",
    "#4f6bd9",
    "#a0522d"
  ];

  const CTRLS = [
    { g: "Underlying" },
    { k: "move", label: "Spot / forward move", min: -2000, max: 2000, step: 5, fmt: (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + d3.format(",")(Math.abs(v)) + " pts", hint: "Forward moves point for point; charts recentre on the new ATM." },
    { k: "sticky", seg: [["strike", "Sticky strike"], ["moneyness", "Sticky moneyness"]], label: "Smile dynamics on a move" },
    { g: "Smile shape (added to the base smile)" },
    { k: "base", seg: [["market", "Market smile"], ["flat", "Flat vol"]], label: "Base smile for all strikes" },
    { k: "flatvol", label: "Flat vol level", min: 2, max: 80, step: 0.1, fmt: (v) => v.toFixed(1) + "%", hint: "Used only when the base smile is flat. Default is the ATM vol." },
    { k: "shift", label: "ATM vol shift", min: -20, max: 20, step: 0.1, fmt: (v) => sgn(v, 1) + " vol" },
    { k: "skew", label: "Skew (per 1% moneyness)", min: -2, max: 2, step: 0.01, fmt: (v) => sgn(v, 2) + " vol", hint: "Negative steepens the put skew." },
    { k: "curv", label: "Curvature (per 1%²)", min: -0.3, max: 0.3, step: 0.002, fmt: (v) => sgn(v, 3) + " vol", hint: "Both wings; raises or lowers every fly IV." },
    { k: "pw", label: "Put-wing convexity (per 1%²)", min: -0.3, max: 0.3, step: 0.002, fmt: (v) => sgn(v, 3) + " vol", hint: "Strikes below the forward only." },
    { k: "cw", label: "Call-wing convexity (per 1%²)", min: -0.3, max: 0.3, step: 0.002, fmt: (v) => sgn(v, 3) + " vol", hint: "Strikes above the forward only." },
    { g: "Butterfly and view" },
    { k: "opt", seg: [["call", "Calls"], ["put", "Puts"]], label: "Fly built from" },
    { k: "wing", label: "Fly wing width", min: 5, max: 800, step: 5, fmt: (v) => "± " + v + " pts" },
    { k: "range", label: "Chart range around ATM", min: 100, max: 3000, step: 100, fmt: (v) => "ATM ± " + d3.format(",")(v) }
  ];

  function sgn(v, d) {
    const s = Math.abs(v).toFixed(d);
    return (v > 0 ? "+" : v < 0 ? "−" : "") + s;
  }

  const box = document.getElementById("fx-ctrls");
  const inputs = {};
  CTRLS.forEach((c) => {
    if (c.g) {
      const t = document.createElement("div");
      t.className = "fx-groupt";
      t.textContent = c.g;
      box.appendChild(t);
      return;
    }
    const w = document.createElement("div");
    w.className = "fx-ctrl";
    const lab = document.createElement("label");
    const sp = document.createElement("span");
    sp.textContent = c.label;
    const b = document.createElement("b");
    lab.append(sp, b);
    w.appendChild(lab);
    if (c.seg) {
      const seg = document.createElement("div");
      seg.className = "fx-seg";
      c.seg.forEach(([v, t]) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = t;
        btn.dataset.v = v;
        btn.addEventListener("click", () => { S[c.k] = v; sync(); redraw(); });
        seg.appendChild(btn);
      });
      w.appendChild(seg);
      inputs[c.k] = { seg, b, c };
    } else {
      const r = document.createElement("input");
      r.type = "range";
      r.min = c.min;
      r.max = c.max;
      r.step = c.step;
      r.setAttribute("aria-label", c.label);
      r.addEventListener("input", () => { S[c.k] = Number(r.value); sync(); redraw(); });
      r.addEventListener("dblclick", () => { S[c.k] = DEF[c.k]; sync(); redraw(); });
      w.appendChild(r);
      inputs[c.k] = { r, b, c };
    }
    if (c.hint) {
      const h = document.createElement("div");
      h.className = "hint";
      h.textContent = c.hint;
      w.appendChild(h);
    }
    box.appendChild(w);
  });

  function sync() {
    Object.values(inputs).forEach(({ r, seg, b, c }) => {
      if (seg) {
        seg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.v === S[c.k])));
        b.textContent = "";
      } else {
        r.value = S[c.k];
        b.textContent = c.fmt(S[c.k]);
      }
    });
  }
  document.getElementById("fx-reset").addEventListener("click", () => { Object.assign(S, DEF); sync(); redraw(); });

  const PAL = ["#d9822b", "#2a9d8f", "#8e5cc4", "#c94f7c", "#7a8b2a", "#a0522d"];
  const CMP = { curves: [], metric: "prem", view: "val", seq: 0 };

  function withState(st, fn) {
    const keep = Object.assign({}, S);
    Object.assign(S, st);
    try { return fn(); }
    finally { Object.assign(S, keep); }
  }

  function cmpSummary(st) {
    const p = [];
    if (st.base === "flat") p.push("flat " + st.flatvol.toFixed(1) + "%");
    if (st.move) {
      p.push("spot " + sgn(st.move, 0));
      if (st.sticky === "moneyness") p.push("sticky mny");
    }
    if (st.shift) p.push("vol " + sgn(st.shift, 1));
    if (st.skew) p.push("skew " + sgn(st.skew, 2));
    if (st.curv) p.push("curv " + sgn(st.curv, 3));
    if (st.pw) p.push("put-wing " + sgn(st.pw, 3));
    if (st.cw) p.push("call-wing " + sgn(st.cw, 3));
    if (st.wing !== 100) p.push("wing ±" + st.wing);
    if (st.opt === "put") p.push("puts");
    return p.length ? p.join(" · ") : "no changes";
  }

  function renderChips() {
    const chips = document.getElementById("cmp-chips");
    chips.replaceChildren();
    CMP.curves.forEach((c) => {
      const chip = document.createElement("span");
      chip.className = "fx-chip" + (c.vis ? "" : " off");
      const sw = document.createElement("i");
      sw.style.background = c.color;
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = c.vis;
      cb.setAttribute("aria-label", "Show " + c.name);
      cb.addEventListener("change", () => { c.vis = cb.checked; renderChips(); redraw(); });
      const nm = document.createElement("b");
      nm.textContent = c.name;
      nm.style.fontWeight = 500;
      const sm = document.createElement("span");
      sm.className = "sm";
      sm.textContent = c.summary;
      const x = document.createElement("button");
      x.type = "button";
      x.textContent = "×";
      x.setAttribute("aria-label", "Delete " + c.name);
      x.addEventListener("click", () => { CMP.curves = CMP.curves.filter((k) => k !== c); renderChips(); redraw(); });
      chip.append(sw, cb, nm, sm, x);
      chips.appendChild(chip);
    });
    document.getElementById("cmp-save").disabled = CMP.curves.length >= PAL.length;
    document.getElementById("cmp-clear").disabled = !CMP.curves.length;
  }

  document.getElementById("cmp-save").addEventListener("click", () => {
    if (CMP.curves.length >= PAL.length) return;
    const inp = document.getElementById("cmp-name");
    CMP.seq += 1;
    const used = new Set(CMP.curves.map((c) => c.color));
    const color = PAL.find((p) => !used.has(p)) || PAL[0];
    const st = Object.assign({}, S);
    CMP.curves.push({
      id: CMP.seq,
      name: inp.value.trim() || ("Curve " + CMP.seq),
      st,
      color,
      vis: true,
      summary: cmpSummary(st)
    });
    inp.value = "";
    renderChips();
    redraw();
  });
  document.getElementById("cmp-clear").addEventListener("click", () => { CMP.curves = []; renderChips(); redraw(); });

  [["metric", [["prem", "Fly premium"], ["fiv", "Fly IV"], ["iv", "Centre IV"]]], ["view", [["val", "Value"], ["chg", "Δ vs today"], ["pct", "Δ %"]]]].forEach(([key, opts]) => {
    const seg = document.createElement("div");
    seg.className = "fx-seg";
    opts.forEach(([v, t]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = t;
      b.dataset.v = v;
      b.addEventListener("click", () => { CMP[key] = v; redraw(); });
      seg.appendChild(b);
    });
    document.getElementById("cmp-ctl").appendChild(seg);
  });
  renderChips();

  const ATTR = { metric: "prem", view: "abs" };
  const FACT = [
    { k: "move", name: "Spot move", color: "#d9822b" },
    { k: "shift", name: "Vol shift", color: "#2b74d8" },
    { k: "skew", name: "Skew", color: "#8e5cc4" },
    { k: "curv", name: "Curvature", color: "#2a9d8f" },
    { k: "pw", name: "Put wing", color: "#c94f7c" },
    { k: "cw", name: "Call wing", color: "#7a8b2a" }
  ];
  [["metric", [["prem", "Fly premium"], ["fiv", "Fly IV"], ["iv", "Centre IV"]]], ["view", [["abs", "Absolute"], ["rel", "Relative share"]]]].forEach(([key, opts]) => {
    const seg = document.createElement("div");
    seg.className = "fx-seg";
    opts.forEach(([v, t]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = t;
      b.dataset.v = v;
      b.addEventListener("click", () => { ATTR[key] = v; redraw(); });
      seg.appendChild(b);
    });
    document.getElementById("attr-ctl").appendChild(seg);
  });
  sync();

  const D = window.DASH_DATA;
  let M = null;

  function dataset(id) {
    const rows = D && D[id];
    return rows ? { status: "ok", data: rows } : { status: "missing", data: [] };
  }

  const f2 = d3.format(",.2f");
  const f3 = d3.format(".3f");
  const f1 = d3.format(".1f");
  const sd = (v, f) => (v > 0 ? "+" : v < 0 ? "−" : "±") + f(Math.abs(v));

  function setTxt(id, t, cls) {
    const e = document.getElementById(id);
    e.textContent = t;
    e.classList.remove("dash-skeleton", "fx-up", "fx-dn");
    if (cls) e.classList.add(cls);
  }

  function ivFn(which) {
    return (K) => which === "today" ? MathFly.todayIV(K, M, S) : MathFly.scenarioIV(K, M, S);
  }

  function redraw() {
    const chartIds = ["ch-smile", "ch-prem", "ch-iv", "ch-chg", "ch-legs", "ch-attr"];
    const smile = dataset("smile_grid");
    const market = dataset("market_inputs");
    if (smile.status !== "ok" || market.status !== "ok") {
      M = null;
      Chart.fail(chartIds, "error");
      return;
    }
    M = M || MathFly.buildModel(smile.data, market.data);

    const C = COLORS;
    const cS = C[0];
    const cB = "var(--cds-chart-muted)";
    const cQ = C[2] || C[1];
    const F1 = MathFly.forward(M, S);
    const atm = MathFly.atmStrike(F1);
    const atm0 = MathFly.atmStrike(M.F0);
    const R = S.range;
    const lo = Math.max(M.kmin + S.wing, atm - R);
    const hi = Math.min(M.kmax - S.wing, atm + R);
    const ks = d3.range(Math.ceil(lo / 5) * 5, hi + 0.001, 5);
    const todayAt = ivFn("today");
    const scenAt = ivFn("scen");
    const rows = ks.map((K) => ({
      K,
      b: MathFly.fly(K, todayAt, M.F0, M, S),
      s: MathFly.fly(K, scenAt, F1, M, S)
    }));

    const sk = d3.range(Math.ceil((atm - R) / 5) * 5, atm + R + 0.001, 5).filter((k) => k >= M.kmin && k <= M.kmax);
    const sv = CMP.curves.filter((c) => c.vis).map((c) => withState(c.st, () => {
      const Fc = M.F0 + c.st.move;
      return {
        c,
        smile: sk.map((k) => ({ x: k, y: MathFly.scenarioIV(k, M, S) })),
        fl: ks.map((K) => {
          const r = MathFly.fly(K, (k) => MathFly.scenarioIV(k, M, S), Fc, M, S);
          return { x: K, prem: r.prem, fiv: r.fiv, iv: r.iv };
        })
      };
    }));
    const cmpLine = (d, key) => ({ name: d.c.name, color: d.c.color, w: 1.8, pts: d.fl.map((p) => ({ x: p.x, y: p[key] })) });
    const cmpLeg = sv.map((d) => ({ name: d.c.name, color: d.c.color }));

    const q = dataset("chain_quotes");
    const inView = (p) => p.x >= atm - R && p.x <= atm + R;
    const qPut = q.status === "ok"
      ? q.data.filter((r) => r.otm_side === "put" && Number(r.used_in_fit) === 1).map((r) => ({ x: Number(r.strike), y: Number(r.otm_ivm) })).filter(inView)
      : [];
    const qCall = q.status === "ok"
      ? q.data.filter((r) => r.otm_side === "call" && Number(r.used_in_fit) === 1).map((r) => ({ x: Number(r.strike), y: Number(r.otm_ivm) })).filter(inView)
      : [];
    const cPd = C[3] || C[1];
    const smileSeries = [
      { name: S.base === "flat" ? "Today (flat vol)" : "Today (fit)", color: cB, pts: sk.map((k) => ({ x: k, y: MathFly.todayIV(k, M, S) })) },
      { name: "Scenario", color: cS, pts: sk.map((k) => ({ x: k, y: MathFly.scenarioIV(k, M, S) })) }
    ];
    sv.forEach((d) => smileSeries.push({ name: d.c.name, color: d.c.color, w: 1.8, pts: d.smile }));
    if (qCall.length) smileSeries.unshift({ name: "Call OTM mid IV", color: cQ, dots: true, pts: qCall });
    if (qPut.length) smileSeries.unshift({ name: "Put OTM mid IV", color: cPd, dots: true, pts: qPut });
    Chart.legend("lg-smile", [
      { name: "Scenario", color: cS },
      { name: "Today (fit)", color: cB },
      { name: "OTM put mid IV (left)", color: cPd, dots: true },
      { name: "OTM call mid IV (right)", color: cQ, dots: true },
      ...cmpLeg
    ]);
    Chart.lineChart(document.getElementById("ch-smile"), {
      series: smileSeries, xdom: [atm - R, atm + R], atm, todayAtm: atm0, yfmt: (v) => f1(v) + "%"
    });

    Chart.legend("lg-prem", [{ name: "Scenario", color: cS }, { name: "Today", color: cB }, ...cmpLeg]);
    document.getElementById("note-prem").textContent = `Long 1 : −2 : 1 ${S.opt === "call" ? "call" : "put"} fly, wings at centre ± ${S.wing}, index points. Call and put flies are identical by put–call parity.`;
    Chart.lineChart(document.getElementById("ch-prem"), {
      series: [
        { name: "Today", color: cB, pts: rows.map((r) => ({ x: r.K, y: r.b.prem })) },
        { name: "Scenario", color: cS, pts: rows.map((r) => ({ x: r.K, y: r.s.prem })) },
        ...sv.map((d) => cmpLine(d, "prem"))
      ],
      xdom: [atm - R, atm + R], atm, todayAtm: atm0, yfmt: (v) => f2(v), zero: true
    });

    Chart.legend("lg-iv", [{ name: "Scenario", color: cS }, { name: "Today", color: cB }, ...cmpLeg]);
    Chart.lineChart(document.getElementById("ch-iv"), {
      series: [
        { name: "Today", color: cB, pts: rows.map((r) => ({ x: r.K, y: r.b.fiv })) },
        { name: "Scenario", color: cS, pts: rows.map((r) => ({ x: r.K, y: r.s.fiv })) },
        ...sv.map((d) => cmpLine(d, "fiv"))
      ],
      xdom: [atm - R, atm + R], atm, todayAtm: atm0, yfmt: (v) => f3(v), zero: true
    });

    const cI = C[1];
    Chart.legend("lg-chg", [{ name: "Δ premium (pts, left)", color: cS }, { name: "Δ fly IV (vol, right)", color: cI, dash: true }]);
    Chart.lineChart(document.getElementById("ch-chg"), {
      series: [{ name: "Δ premium", color: cS, pts: rows.map((r) => ({ x: r.K, y: r.s.prem - r.b.prem })), fmt: (v) => sd(v, f2) }],
      series2: [{ name: "Δ fly IV", color: cI, dash: "5 4", pts: rows.map((r) => ({ x: r.K, y: r.s.fiv - r.b.fiv })), fmt: (v) => sd(v, f3) }],
      xdom: [atm - R, atm + R], atm, todayAtm: atm0, yfmt: (v) => f2(v), y2fmt: (v) => f3(v), zero: true
    });

    const qc = q.status === "ok" ? q.data.map((r) => ({ x: Number(r.strike), y: Number(r.call_mid) })).filter((p) => p.x >= atm - R && p.x <= atm + R) : [];
    const qp = q.status === "ok" ? q.data.map((r) => ({ x: Number(r.strike), y: Number(r.put_mid) })).filter((p) => p.x >= atm - R && p.x <= atm + R) : [];
    const cP = C[3] || C[1];
    const legSeries = [
      { name: "Call today", color: cB, pts: sk.map((k) => ({ x: k, y: MathFly.price("call", M.F0, k, MathFly.todayIV(k, M, S) / 100, M) })) },
      { name: "Put today", color: cB, dash: "5 4", pts: sk.map((k) => ({ x: k, y: MathFly.price("put", M.F0, k, MathFly.todayIV(k, M, S) / 100, M) })) },
      { name: "Call scenario", color: cS, pts: sk.map((k) => ({ x: k, y: MathFly.price("call", F1, k, MathFly.scenarioIV(k, M, S) / 100, M) })) },
      { name: "Put scenario", color: cP, pts: sk.map((k) => ({ x: k, y: MathFly.price("put", F1, k, MathFly.scenarioIV(k, M, S) / 100, M) })) }
    ];
    if (qc.length) legSeries.unshift({ name: "Quoted call mid", color: cS, dots: true, pts: qc });
    if (qp.length) legSeries.unshift({ name: "Quoted put mid", color: cP, dots: true, pts: qp });
    Chart.legend("lg-legs", [
      { name: "Call scenario", color: cS },
      { name: "Put scenario", color: cP },
      { name: "Call today", color: cB },
      { name: "Put today", color: cB, dash: true },
      { name: "Quoted call / put mids", color: cQ, dots: true }
    ]);
    Chart.lineChart(document.getElementById("ch-legs"), {
      series: legSeries, xdom: [atm - R, atm + R], atm, todayAtm: atm0, yfmt: (v) => d3.format(",.0f")(v), zero: true
    });

    const lt = document.querySelector("#fx-legs tbody");
    lt.replaceChildren();
    const legsOf = (type, F, ivf) => [-S.wing, 0, S.wing].map((d) => MathFly.price(type, F, atm + d, ivf(atm + d) / 100, M));
    const cT = legsOf("call", M.F0, todayAt);
    const cSn = legsOf("call", F1, scenAt);
    const pT = legsOf("put", M.F0, todayAt);
    const pSn = legsOf("put", F1, scenAt);
    const wts = [1, -2, 1];
    const names = ["Long 1 lower wing", "Short 2 centre", "Long 1 upper wing"];
    names.forEach((n, i) => {
      const tr = document.createElement("tr");
      [n, d3.format(",")(atm + [-S.wing, 0, S.wing][i]), f2(cT[i]), f2(cSn[i]), f2(pT[i]), f2(pSn[i])].forEach((t) => {
        const td = document.createElement("td");
        td.textContent = t;
        tr.appendChild(td);
      });
      lt.appendChild(tr);
    });
    const tot = (arr) => arr.reduce((s, v, i) => s + wts[i] * v, 0);
    const trT = document.createElement("tr");
    trT.className = "atm";
    ["Fly (1 : −2 : 1)", d3.format(",")(atm), f2(tot(cT)), f2(tot(cSn)), f2(tot(pT)), f2(tot(pSn))].forEach((t) => {
      const td = document.createElement("td");
      td.textContent = t;
      trT.appendChild(td);
    });
    lt.appendChild(trT);
    document.getElementById("note-legs").textContent = `ATM ${d3.format(",")(atm)} ± ${S.wing}. Each put leg = call leg − DF·(F − K); the linear term cancels in 1 : −2 : 1, so the fly totals match (difference ${d3.format(".1e")(Math.abs(tot(cSn) - tot(pSn)))}).`;

    (function attribution() {
      const key = ATTR.metric;
      const fmtv = key === "fiv" ? f3 : f2;
      const pick = (r) => key === "prem" ? r.prem : key === "fiv" ? r.fiv : r.iv;
      document.querySelectorAll("#attr-ctl .fx-seg").forEach((seg, i) => {
        seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === (i === 0 ? ATTR.metric : ATTR.view))));
      });
      const base0 = Object.assign({}, S, { move: 0, shift: 0, skew: 0, curv: 0, pw: 0, cw: 0 });
      const val = (st) => withState(st, () => {
        const Fc = M.F0 + st.move;
        return ks.map((K) => pick(MathFly.fly(K, (k) => MathFly.scenarioIV(k, M, S), Fc, M, S)));
      });
      const v0 = val(base0);
      const vT = val(Object.assign({}, S));
      const act = FACT.filter((f) => Number(S[f.k]) !== 0);
      const chEl = document.getElementById("ch-attr");
      const tb = document.querySelector("#fx-attr-tbl tbody");
      const th = document.querySelector("#fx-attr-tbl thead");
      tb.replaceChildren();
      th.replaceChildren();
      const what = { prem: "fly premium (index pts)", fiv: "fly IV (vol pts)", iv: "centre implied vol (vol pts)" }[key];
      if (!act.length) {
        chEl.replaceChildren();
        Chart.legend("lg-attr", []);
        const msg = document.createElement("div");
        msg.className = "fx-note";
        msg.style.padding = "40px 0";
        msg.style.textAlign = "center";
        msg.textContent = "Move a smile slider (spot, vol shift, skew, curvature or a wing) to see how much each one changes the curve at every strike.";
        chEl.appendChild(msg);
        document.getElementById("note-attr").textContent = "Breaks the scenario change in " + what + " into the part each slider causes on its own.";
        return;
      }
      const parts = act.map((f) => {
        const st = Object.assign({}, base0, { [f.k]: S[f.k] });
        const v = val(st);
        return { f, c: v.map((x, i) => x - v0[i]) };
      });
      const total = vT.map((x, i) => x - v0[i]);
      const inter = total.map((t, i) => t - parts.reduce((s, p) => s + p.c[i], 0));
      const hasInter = d3.max(inter, (v) => Math.abs(v)) > 1e-6 * Math.max(1e-9, d3.max(total, (v) => Math.abs(v)));
      const denom = ks.map((_, i) => parts.reduce((s, p) => s + Math.abs(p.c[i]), 0) + (hasInter ? Math.abs(inter[i]) : 0));
      const share = (arr, i) => denom[i] < 1e-12 ? 0 : Math.abs(arr[i]) / denom[i] * 100;
      const rel = ATTR.view === "rel";
      const series = parts.map((p) => ({
        name: p.f.name, color: p.f.color, w: 2,
        pts: ks.map((K, i) => ({ x: K, y: rel ? share(p.c, i) : p.c[i] })),
        fmt: rel ? ((v) => f1(v) + "%") : ((v) => sd(v, fmtv))
      }));
      if (hasInter) {
        series.push({
          name: "Interaction", color: "var(--cds-chart-muted)", w: 2, dash: "5 4",
          pts: ks.map((K, i) => ({ x: K, y: rel ? share(inter, i) : inter[i] })),
          fmt: rel ? ((v) => f1(v) + "%") : ((v) => sd(v, fmtv))
        });
      }
      if (!rel) {
        series.push({
          name: "Total change", color: "var(--color-fg)", w: 2.5, dash: "2 3",
          pts: ks.map((K, i) => ({ x: K, y: total[i] })),
          fmt: (v) => sd(v, fmtv)
        });
      }
      Chart.legend("lg-attr", series.map((sr) => ({ name: sr.name, color: sr.color, dash: !!sr.dash })));
      Chart.lineChart(chEl, {
        series, xdom: [atm - R, atm + R], atm, todayAtm: atm0,
        yfmt: rel ? ((v) => d3.format(".0f")(v) + "%") : ((v) => fmtv(v)),
        zero: true
      });
      const hdr = ["Strike", "vs ATM", "Total Δ"];
      parts.forEach((p) => { hdr.push(p.f.name + " Δ", p.f.name + " share"); });
      if (hasInter) hdr.push("Interaction Δ", "Interaction share");
      const trh = document.createElement("tr");
      hdr.forEach((t, j) => {
        const h = document.createElement("th");
        if (j >= 3 && (j - 3) % 2 === 0) h.className = "sep";
        const col = j >= 3 ? (parts[Math.floor((j - 3) / 2)] ? parts[Math.floor((j - 3) / 2)].f.color : null) : null;
        if (col && (j - 3) % 2 === 0) {
          const dt = document.createElement("span");
          dt.className = "fx-dot";
          dt.style.background = col;
          h.appendChild(dt);
        }
        h.appendChild(document.createTextNode(t));
        trh.appendChild(h);
      });
      th.appendChild(trh);
      const byK = new Map(ks.map((K, i) => [K, i]));
      let near = null;
      let nd = 1e9;
      for (let K = Math.ceil(lo / 100) * 100; K <= hi + 1e-9; K += 100) {
        const i = byK.get(K);
        if (i === undefined) continue;
        const tr = document.createElement("tr");
        if (Math.abs(K - atm) < nd) { nd = Math.abs(K - atm); near = tr; }
        const cells = [
          [d3.format(",")(K)],
          [Chart.fmtOff(K - atm)],
          [sd(total[i], fmtv), Math.abs(total[i]) < 1e-9 ? "" : total[i] > 0 ? "fx-up" : "fx-dn"]
        ];
        parts.forEach((p) => {
          cells.push([sd(p.c[i], fmtv), (Math.abs(p.c[i]) < 1e-9 ? "" : p.c[i] > 0 ? "fx-up" : "fx-dn") + " sep"]);
          cells.push([f1(share(p.c, i)) + "%"]);
        });
        if (hasInter) {
          cells.push([sd(inter[i], fmtv), "sep"]);
          cells.push([f1(share(inter, i)) + "%"]);
        }
        cells.forEach(([t, cls]) => {
          const td = document.createElement("td");
          td.textContent = t;
          if (cls) td.className = cls.trim();
          tr.appendChild(td);
        });
        tb.appendChild(tr);
      }
      if (near) near.className = "atm";
      document.getElementById("note-attr").textContent = "Change in " + what + " from today, split by smile factor. Each factor line is the change that slider would cause on its own, with every other slider at zero. " + (hasInter ? "“Interaction” is the rest: the extra change that only appears when the factors act together (repricing is not linear, and skew, curvature and wings are measured from the moved forward). " : "") + (rel ? "Relative share is each part’s size as a % of the sum of all parts’ sizes at that strike, so the shares add to 100%." : "The dotted line is the total change, which equals the sum of the parts.") + " Table rows every 100 points.";
    })();

    (function arbitrage() {
      const kg = d3.range(Math.max(M.kmin + S.wing, Math.ceil((atm - R) / 5) * 5), Math.min(M.kmax - S.wing, atm + R) + 0.001, 5);
      const cp = kg.map((k) => MathFly.price("call", F1, k, MathFly.scenarioIV(k, M, S) / 100, M));
      let negFly = null;
      let rising = null;
      let over = null;
      kg.forEach((k) => {
        const r = rows[ks.indexOf(k)];
        if (r && r.s.prem < -1e-6 && (negFly === null || r.s.prem < negFly[1])) negFly = [k, r.s.prem];
      });
      for (let i = 1; i < cp.length; i++) {
        const sl = (cp[i] - cp[i - 1]) / 5 / M.DF;
        if (sl > 1e-6 && rising === null) rising = kg[i];
        if (sl < -1 - 1e-6 && over === null) over = kg[i];
      }
      const el = document.getElementById("fx-arb");
      const bad = [];
      if (negFly) bad.push(`a negative butterfly price (${f2(negFly[1])} at ${d3.format(",")(negFly[0])})`);
      if (over !== null) bad.push(`a call spread worth more than its discounted width (near ${d3.format(",")(over)})`);
      if (rising !== null) bad.push(`a call price that rises with strike (near ${d3.format(",")(rising)})`);
      el.textContent = bad.length
        ? "No-arbitrage check: this scenario produces " + bad.join("; ") + ". Treat the curves as a pattern, not a tradable smile."
        : "No-arbitrage check: passed on the plotted strikes (no negative butterflies, call spreads within width, calls falling with strike).";
      el.style.color = bad.length ? "var(--color-bad)" : "var(--color-fg-muted)";
    })();

    (function compareTable() {
      const key = CMP.metric;
      const fmtv = key === "fiv" ? f3 : f2;
      const view = CMP.view;
      document.querySelectorAll("#cmp-ctl .fx-seg").forEach((seg, i) => {
        seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === (i === 0 ? CMP.metric : CMP.view))));
      });
      const th = document.querySelector("#fx-cmp-tbl thead");
      th.replaceChildren();
      const tr0 = document.createElement("tr");
      const cols = [["Strike", null], ["vs ATM", null], ["Today", null], ["Live scenario", cS], ...sv.map((d) => [d.c.name, d.c.color])];
      cols.forEach(([t, col], j) => {
        const h = document.createElement("th");
        if (col) {
          const dot = document.createElement("span");
          dot.className = "fx-dot";
          dot.style.background = col;
          h.appendChild(dot);
        }
        h.appendChild(document.createTextNode(t));
        if (j === 2) h.className = "sep";
        tr0.appendChild(h);
      });
      th.appendChild(tr0);
      const tb = document.querySelector("#fx-cmp-tbl tbody");
      tb.replaceChildren();
      const byK = new Map(rows.map((r, i) => [r.K, i]));
      let near = null;
      let nd = 1e9;
      for (let K = Math.ceil(lo / 50) * 50; K <= hi + 1e-9; K += 50) {
        const i = byK.get(K);
        if (i === undefined) continue;
        const r = rows[i];
        const tod = key === "prem" ? r.b.prem : key === "fiv" ? r.b.fiv : r.b.iv;
        const vals = [key === "prem" ? r.s.prem : key === "fiv" ? r.s.fiv : r.s.iv, ...sv.map((d) => d.fl[i][key])];
        const tr = document.createElement("tr");
        if (Math.abs(K - atm) < nd) { nd = Math.abs(K - atm); near = tr; }
        const cells = [[d3.format(",")(K)], [Chart.fmtOff(K - atm)], [fmtv(tod), "sep"]];
        vals.forEach((v) => {
          const dlt = v - tod;
          const pc = Math.abs(tod) < 1e-6 ? null : dlt / Math.abs(tod) * 100;
          if (view === "val") cells.push([fmtv(v)]);
          else if (view === "chg") cells.push([sd(dlt, fmtv), Math.abs(dlt) < 1e-9 ? "" : dlt > 0 ? "fx-up" : "fx-dn"]);
          else cells.push([pc === null ? "n/a" : sd(pc, f1) + "%", pc === null || Math.abs(pc) < 1e-9 ? "" : pc > 0 ? "fx-up" : "fx-dn"]);
        });
        cells.forEach(([t, cls]) => {
          const td = document.createElement("td");
          td.textContent = t;
          if (cls) td.className = cls;
          tr.appendChild(td);
        });
        tb.appendChild(tr);
      }
      if (near) near.className = "atm";
      const what = { prem: "fly premium (index pts)", fiv: "fly IV (vol pts)", iv: "centre implied vol (%)" }[key];
      document.getElementById("note-cmp").textContent = (sv.length ? sv.length + " saved curve" + (sv.length > 1 ? "s" : "") + " shown. " : "No saved curves yet: set the sliders and press “Save current as curve”. ") + "Showing " + what + " every 50 points, " + (view === "val" ? "as values." : view === "chg" ? "as the change from today at the same strike." : "as % change from today (n/a where today is about zero).") + " “Today” and “Live scenario” follow the sliders above; saved curves keep the settings they were saved with.";
    })();

    const dt = document.querySelector("#fx-detail tbody");
    dt.replaceChildren();
    const lo25 = Math.max(M.kmin + S.wing, atm - R);
    const hi25 = Math.min(M.kmax - S.wing, atm + R);
    const pctOf = (b, sN) => Math.abs(b) < 1e-6 ? null : (sN - b) / Math.abs(b) * 100;
    const cellsFor = (b, sN, f) => {
      const dlt = sN - b;
      const pc = pctOf(b, sN);
      return [f(b), f(sN), sd(dlt, f), pc === null ? "n/a" : sd(pc, f1) + "%", dlt, pc];
    };
    let nrows = 0;
    let nearest = null;
    let nearD = 1e9;
    for (let K = Math.ceil(lo25 / 25) * 25; K <= hi25 + 1e-9; K += 25) {
      const bb = MathFly.fly(K, todayAt, M.F0, M, S);
      const ss = MathFly.fly(K, scenAt, F1, M, S);
      const c1 = cellsFor(bb.iv, ss.iv, f2);
      const c2 = cellsFor(bb.prem, ss.prem, f2);
      const c3 = cellsFor(bb.fiv, ss.fiv, f3);
      const tr = document.createElement("tr");
      const dA = Math.abs(K - atm);
      if (dA < nearD) { nearD = dA; nearest = tr; }
      const vals = [d3.format(",")(K), Chart.fmtOff(K - atm), ...c1.slice(0, 4), ...c2.slice(0, 4), ...c3.slice(0, 4)];
      vals.forEach((t, j) => {
        const td = document.createElement("td");
        td.textContent = t;
        if (j === 2 || j === 6 || j === 10) td.className = "sep";
        tr.appendChild(td);
      });
      [[4, c1[4]], [5, c1[5]], [8, c2[4]], [9, c2[5]], [12, c3[4]], [13, c3[5]]].forEach(([j, v]) => {
        if (v !== null && Math.abs(v) > 1e-9) tr.children[j].className = v > 0 ? "fx-up" : "fx-dn";
      });
      dt.appendChild(tr);
      nrows++;
    }
    if (nearest) nearest.className = "atm";
    document.getElementById("note-detail").textContent = `${S.opt === "call" ? "Call" : "Put"} flies with wings ± ${S.wing}, ${nrows} strikes every 25 points from ATM−${R} to ATM+${R} (limited by the data). Δ = scenario − today at the same strike; Δ % = Δ ÷ |today|, shown n/a where today’s value is about zero (for example fly IV on a flat smile).`;

    const a = MathFly.fly(atm, scenAt, F1, M, S);
    const b = MathFly.fly(atm, todayAt, M.F0, M, S);
    setTxt("k-fwd", d3.format(",.2f")(F1));
    setTxt("k-fwd-s", `ATM ${d3.format(",")(atm)}` + (S.move ? ` · today ${d3.format(",.2f")(M.F0)} (ATM ${d3.format(",")(atm0)})` : " · implied forward"));
    setTxt("k-iv", f2(a.iv) + "%");
    setTxt("k-iv-s", `today at K ${d3.format(",")(atm)}: ${f2(b.iv)}% (${sd(a.iv - b.iv, f2)})`);
    setTxt("k-fp", f2(a.prem));
    const dp = a.prem - b.prem;
    const other = MathFly.fly(atm, scenAt, F1, M, S, S.opt === "call" ? "put" : "call");
    setTxt("k-fp-s", `today at same strike ${f2(b.prem)} (${sd(dp, f2)}) · ${S.opt === "call" ? "put" : "call"} fly ${f2(other.prem)}`);
    document.getElementById("k-fp-l").textContent = `ATM ${S.opt} fly premium`;
    setTxt("k-fi", f3(a.fiv));
    setTxt("k-fi-s", `today at same strike ${f3(b.fiv)} (${sd(a.fiv - b.fiv, f3)})`);

    const big = rows.reduce((m, r) => Math.abs(r.s.prem - r.b.prem) > Math.abs(m.s.prem - m.b.prem) ? r : m, rows[0]);
    const changed = S.base === "flat" || S.move || S.shift || S.skew || S.curv || S.pw || S.cw;
    setTxt("fx-take", changed
      ? `Scenario ATM ${d3.format(",")(atm)} ±${S.wing} fly costs ${f2(a.prem)} vs ${f2(b.prem)} today at the same strikes (${sd(dp, f2)}); the biggest fixed-strike change in view is ${sd(big.s.prem - big.b.prem, f2)} pts at ${Chart.fmtOff(big.K - atm)} (K ${d3.format(",")(big.K)}).`
      : `Today the ATM ${d3.format(",")(atm)} ±${S.wing} fly costs ${f2(a.prem)} pts with fly IV ${f3(a.fiv)} vol; move the sliders to see how it reprices at fixed strikes.`);

    const tb = document.querySelector("#fx-tbl tbody");
    tb.replaceChildren();
    const tr0 = Math.min(500, Math.floor(R / 100) * 100);
    document.getElementById("note-tbl").textContent = `${S.opt === "call" ? "Call" : "Put"} flies, centres every 100 points from ATM−${tr0} to ATM+${tr0}; wings ± ${S.wing}. Δ = scenario − today at the same strike (identical for call and put flies).`;
    for (let d = -tr0; d <= tr0; d += 100) {
      const K = atm + d;
      if (K - S.wing < M.kmin || K + S.wing > M.kmax) continue;
      const bb = MathFly.fly(K, todayAt, M.F0, M, S);
      const ss = MathFly.fly(K, scenAt, F1, M, S);
      const tr = document.createElement("tr");
      if (d === 0) tr.className = "atm";
      [Chart.fmtOff(d), d3.format(",")(K), f2(bb.iv), f2(ss.iv), f2(bb.prem), f2(ss.prem), sd(ss.prem - bb.prem, f2), f3(bb.fiv), f3(ss.fiv), sd(ss.fiv - bb.fiv, f3)]
        .forEach((t, j) => {
          const td = document.createElement("td");
          td.textContent = t;
          if (j === 6 || j === 9) {
            const v = j === 6 ? ss.prem - bb.prem : ss.fiv - bb.fiv;
            if (Math.abs(v) > 1e-9) td.className = v > 0 ? "fx-up" : "fx-dn";
          }
          tr.appendChild(td);
        });
      tb.appendChild(tr);
    }
  }

  window.fxRedraw = redraw;
  redraw();
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(redraw, 120);
  });
})();
