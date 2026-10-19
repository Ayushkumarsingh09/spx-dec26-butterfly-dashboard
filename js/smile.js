/* SPX 60-DTE smile lab driven by the SNP ladder (every trading day). */
(function () {
  const RAW = window.SMILE60;
  const DAYS = RAW.days;
  const DATES = DAYS.map((d) => d.d);
  const BY = new Map(DAYS.map((d) => [d.d, d]));
  const DX = RAW.deltaX;
  const SX = RAW.strikeX;
  const PAL = [
    "var(--cds-chart-categorical-1)",
    "var(--cds-chart-categorical-2)",
    "var(--cds-chart-categorical-3)",
    "var(--cds-chart-categorical-4)",
    "#c94f7c",
    "#7a8b2a",
    "#4f6bd9",
    "#a0522d"
  ];
  const DELTA_LEVELS = [5, 10, 15, 20, 25, 30, 35, 40, 45];

  const wanted = ["2026-09-25", "2026-09-28"].filter((d) => BY.has(d));
  let selected = (wanted.length ? wanted : DATES.slice(-2)).slice();
  let view = "delta";
  let filter = "";

  const f1 = (v) => d3.format(",.2f")(v);
  const f2 = (v) => d3.format(".2f")(v);
  const f3 = (v) => d3.format(".3f")(v);
  const f4 = (v) => d3.format(".4f")(v);
  const signed = (v, f) => (v > 0 ? "+" : v < 0 ? "−" : "") + f(Math.abs(v));

  function deltaName(x) {
    if (x === 50) return "ATM";
    if (x < 50) return x + "Δ P";
    return (100 - x) + "Δ C";
  }
  function flyName(x) {
    if (x === 50) return "ATM (50Δ)";
    if (x < 50) return x + "P";
    return (100 - x) + "C";
  }
  function strikeName(off) {
    if (off === 0) return "ATM";
    return off < 0 ? "ATM" + off : "ATM+" + off;
  }
  function putIndex(level) { return DX.indexOf(level); }
  function callIndex(level) { return DX.indexOf(100 - level); }
  function ivPut(day, level) { return day.iv[putIndex(level)]; }
  function ivCall(day, level) { return day.iv[callIndex(level)]; }
  function atmIv(day) { return day.iv[DX.indexOf(50)]; }
  function siv(day, off) { return day.siv[SX.indexOf(off)]; }
  function prem(day, off) { return day.sp[SX.indexOf(off)]; }
  function rr(day, level) { return ivPut(day, level) - ivCall(day, level); }
  function bf(day, level) { return (ivPut(day, level) + ivCall(day, level)) / 2 - atmIv(day); }
  const UP = "#1f9d55";
  const DN = "#d64545";
  function barPt(x, y) { return { x, y, c: y >= 0 ? UP : DN }; }
  function cls(v) { return v > 1e-9 ? "fx-up" : v < -1e-9 ? "fx-dn" : ""; }

  function paint(table, headers, rows) {
    const th = table.querySelector("thead");
    const tb = table.querySelector("tbody");
    th.replaceChildren();
    tb.replaceChildren();
    const hr = document.createElement("tr");
    headers.forEach((t) => {
      const h = document.createElement("th");
      h.textContent = t;
      hr.appendChild(h);
    });
    th.appendChild(hr);
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      row.forEach((cell) => {
        const td = document.createElement("td");
        td.textContent = cell.t;
        if (cell.cls) td.className = cell.cls;
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
  }

  function vals(days, fn, fmt) {
    const v = days.map(fn);
    const cells = v.map((n) => ({ t: fmt(n) }));
    if (days.length > 1) {
      const d = v[v.length - 1] - v[0];
      cells.push({ t: signed(d, fmt), cls: cls(d) });
    }
    return cells;
  }

  function block(parent, title, headers, rows) {
    const wrap = document.createElement("div");
    wrap.className = "s60-block";
    const h = document.createElement("h3");
    h.textContent = title;
    const sc = document.createElement("div");
    sc.className = "fx-detail-wrap";
    const table = document.createElement("table");
    table.className = "fx-tbl";
    table.append(document.createElement("thead"), document.createElement("tbody"));
    sc.appendChild(table);
    wrap.append(h, sc);
    parent.appendChild(wrap);
    paint(table, headers, rows);
  }

  function headers(days, first) {
    return [first, ...days.map((d) => d.d), ...(days.length > 1 ? ["Change"] : [])];
  }

  let regimeDate = BY.has("2026-09-28") ? "2026-09-28" : DATES[DATES.length - 1];
  let monthKey = "";

  function sorted() { return selected.slice().sort(); }

  function color(i) { return PAL[i % PAL.length]; }

  function chart(el, cfg) {
    el.replaceChildren();
    if (!cfg.series.length || !cfg.series[0].pts.length) {
      el.classList.add("fx-fail");
      el.textContent = "Select at least one date.";
      return;
    }
    el.classList.remove("fx-fail");
    const W = Math.max(320, el.clientWidth || 640);
    const H = cfg.h || 320;
    const svg = d3.select(el).append("svg").attr("width", "100%").attr("viewBox", `0 0 ${W} ${H}`);
    const allY = cfg.series.flatMap((s) => s.pts.map((p) => p.y)).filter((v) => v != null && isFinite(v));
    let [y0, y1] = d3.extent(allY);
    if (cfg.zero) { y0 = Math.min(y0, 0); y1 = Math.max(y1, 0); }
    if (!(y1 > y0)) { y0 -= 1; y1 += 1; }
    const pad = (y1 - y0) * 0.08;
    const bottom = cfg.xAngle ? 92 : 36;
    const y = d3.scaleLinear([y0 - pad, y1 + pad], [H - bottom, 16]).nice();
    const meas = svg.append("g").attr("font-size", 12);
    let lw = 0;
    y.ticks(6).forEach((t) => {
      const n = meas.append("text").text(cfg.yfmt(t));
      lw = Math.max(lw, n.node().getComputedTextLength());
      n.remove();
    });
    meas.remove();
    const L = Math.ceil(lw) + 28;
    const R = 12;
    const cats = cfg.cats;
    const x = cats ? d3.scalePoint(cats, [L, W - R]) : d3.scaleLinear(cfg.xdom, [L, W - R]);
    const g = svg.append("g");
    g.selectAll("line.gy").data(y.ticks(6)).join("line")
      .attr("x1", L).attr("x2", W - R).attr("y1", (d) => y(d)).attr("y2", (d) => y(d))
      .attr("stroke", "var(--cds-chart-grid)");
    g.append("line").attr("x1", L).attr("x2", W - R).attr("y1", H - bottom).attr("y2", H - bottom)
      .attr("stroke", "var(--cds-chart-axis)");
    g.selectAll("text.ty").data(y.ticks(6)).join("text")
      .attr("x", L - 8).attr("y", (d) => y(d)).attr("dy", "0.32em").attr("text-anchor", "end")
      .attr("font-size", 11).attr("fill", "var(--color-fg-muted)").text(cfg.yfmt);
    const xt = cfg.xticks || (cats ? cats.filter((_, i) => i % (cfg.every || 1) === 0) : x.ticks(7));
    g.selectAll("text.tx").data(xt).join("text")
      .attr("x", (d) => x(d)).attr("y", H - bottom + 16)
      .attr("text-anchor", cfg.xAngle ? "start" : "middle")
      .attr("font-size", 11).attr("fill", "var(--color-fg-muted)")
      .attr("transform", cfg.xAngle ? (d) => `rotate(${cfg.xAngle},${x(d)},${H - bottom + 16})` : null)
      .text((d) => cfg.xfmt ? cfg.xfmt(d) : d);
    if (cfg.zero) g.append("line").attr("x1", L).attr("x2", W - R).attr("y1", y(0)).attr("y2", y(0))
      .attr("stroke", "var(--cds-chart-reference)").attr("stroke-dasharray", "3 3");
    if (cfg.marks && cats) {
      cfg.marks.forEach((m) => {
        if (cats.indexOf(m) < 0) return;
        g.append("line").attr("x1", x(m)).attr("x2", x(m)).attr("y1", 12).attr("y2", H - bottom)
          .attr("stroke", "var(--cds-chart-reference)").attr("stroke-dasharray", "2 3");
      });
    }
    cfg.series.forEach((s) => {
      const pts = s.pts.filter((p) => p.y != null && isFinite(p.y));
      if (!pts.length) return;
      if (s.bars) {
        const bw = cats
          ? Math.min(36, Math.max(4, x.step() * 0.62))
          : Math.max(3, Math.abs(x(pts[Math.min(1, pts.length - 1)].x) - x(pts[0].x)) * 0.55);
        g.append("g").selectAll("rect").data(pts).join("rect")
          .attr("x", (p) => x(p.x) - bw / 2).attr("width", bw)
          .attr("y", (p) => Math.min(y(p.y), y(0)))
          .attr("height", (p) => Math.abs(y(p.y) - y(0)))
          .attr("fill", (p) => p.c || s.color);
      } else {
        g.append("path")
          .attr("d", d3.line().defined((p) => p.y != null).x((p) => x(p.x)).y((p) => y(p.y))(pts))
          .attr("fill", "none").attr("stroke", s.color).attr("stroke-width", 2)
          .attr("stroke-dasharray", s.dash ? "5 3" : null);
        if (!cats || cats.length < 40) {
          g.append("g").selectAll("circle").data(pts).join("circle")
            .attr("cx", (p) => x(p.x)).attr("cy", (p) => y(p.y)).attr("r", 3.2).attr("fill", s.color);
        }
      }
    });
    const tip = document.createElement("div");
    tip.className = "fx-tip";
    el.appendChild(tip);
    const ref = cfg.series[0].pts;
    svg.append("rect").attr("x", L).attr("y", 0).attr("width", Math.max(0, W - L - R)).attr("height", H - bottom + 6).attr("fill", "transparent")
      .on("pointermove", (ev) => {
        const [mx] = d3.pointer(ev);
        let row;
        if (cats) row = ref.reduce((best, p) => Math.abs(x(p.x) - mx) < Math.abs(x(best.x) - mx) ? p : best, ref[0]);
        else {
          const xv = x.invert(mx);
          row = ref[d3.bisector((p) => p.x).center(ref, xv)];
        }
        tip.replaceChildren();
        const t = document.createElement("div");
        t.className = "t";
        t.textContent = cfg.xfmt ? cfg.xfmt(row.x) : String(row.x);
        tip.appendChild(t);
        cfg.series.forEach((s) => {
          const p = cats ? s.pts.find((q) => q.x === row.x) : s.pts[d3.bisector((q) => q.x).center(s.pts, row.x)];
          if (!p || p.y == null) return;
          const line = document.createElement("div");
          line.className = "r";
          const sw = document.createElement("i");
          sw.style.background = s.color;
          const tx = document.createElement("span");
          tx.textContent = (p.label || s.name) + ": " + cfg.yfmt(p.y);
          line.append(sw, tx);
          tip.appendChild(line);
        });
        tip.style.display = "block";
        tip.style.left = Math.max(0, Math.min(el.clientWidth - tip.offsetWidth - 4, mx + 12)) + "px";
        tip.style.top = "8px";
      })
      .on("pointerleave", () => { tip.style.display = "none"; });
  }

  function legend(id, items) {
    const el = document.getElementById(id);
    if (!el) return;
    el.replaceChildren();
    items.forEach((it) => {
      const s = document.createElement("span");
      const i = document.createElement("i");
      i.style.borderTopColor = it.color;
      s.append(i, document.createTextNode(it.name));
      el.appendChild(s);
    });
  }

  function smilePts(day) {
    if (view === "strike") return SX.map((x, i) => ({ x, y: day.siv[i] }));
    return DX.map((x, i) => ({ x, y: day.iv[i] }));
  }
  function axis() {
    if (view === "strike") {
      return { xdom: [SX[0] - 40, SX[SX.length - 1] + 40], xticks: SX.filter((x) => x % 200 === 0), xfmt: strikeName, xTitle: "Strike offset" };
    }
    return { xdom: [-0.3, 100.3], xticks: [5, 10, 25, 50, 75, 90, 95], xfmt: deltaName, xTitle: "Delta" };
  }

  function flies(day) {
    const out = [];
    for (let i = 1; i < DX.length - 1; i++) out.push({ x: DX[i], y: (day.iv[i - 1] + day.iv[i + 1]) / 2 - day.iv[i] });
    return out;
  }
  function fixedFlies(day) {
    const out = [];
    for (let i = 1; i < SX.length - 1; i++) out.push({ x: SX[i], y: (day.siv[i - 1] + day.siv[i + 1]) / 2 - day.siv[i] });
    return out;
  }
  let flyWidth = 100;
  function ladderAt(day, off, key) {
    const xs = SX;
    const ys = day[key];
    if (off < xs[0] || off > xs[xs.length - 1]) return null;
    let hi = 1;
    while (hi < xs.length && xs[hi] < off) hi++;
    const lo = hi - 1;
    const span = xs[hi] - xs[lo];
    const t = span === 0 ? 0 : (off - xs[lo]) / span;
    return ys[lo] + t * (ys[hi] - ys[lo]);
  }
  function wingsInside(center) {
    return center - flyWidth >= SX[0] && center + flyWidth <= SX[SX.length - 1];
  }
  function strikeFlyIv(day, off) {
    if (!wingsInside(off)) return null;
    const low = ladderAt(day, off - flyWidth, "siv");
    const mid = ladderAt(day, off, "siv");
    const high = ladderAt(day, off + flyWidth, "siv");
    return (low + high) / 2 - mid;
  }
  function erfc(x) {
    const z = Math.abs(x);
    const t = 1 / (1 + 0.5 * z);
    const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
    return x >= 0 ? r : 2 - r;
  }
  const normCdf = (x) => 0.5 * erfc(-x / Math.SQRT2);
  function black76(type, F, K, sigma, T) {
    const sT = sigma * Math.sqrt(T);
    const d1 = (Math.log(F / K) + 0.5 * sT * sT) / sT;
    if (type === "put") return K * normCdf(sT - d1) - F * normCdf(-d1);
    return F * normCdf(d1) - K * normCdf(d1 - sT);
  }
  function legPremium(day, off) {
    const i = SX.indexOf(off);
    if (i >= 0) return day.sp[i];
    const ivPct = ladderAt(day, off, "siv");
    if (ivPct == null || !(day.atm + off > 0)) return null;
    return black76(off < 0 ? "put" : "call", day.u, day.atm + off, ivPct / 100, 60 / 365);
  }
  function strikeFlyPx(day, off) {
    if (!wingsInside(off)) return null;
    const low = legPremium(day, off - flyWidth);
    const mid = legPremium(day, off);
    const high = legPremium(day, off + flyWidth);
    if (low == null || mid == null || high == null) return null;
    return low + high - 2 * mid;
  }
  const atmCurveOff = new Set();
  const chgOff = new Set();
  function sideKeep(x, side, atm) {
    if (side === "put") return x < 0 || (atm && x === atm);
    if (side === "call") return x > 0 || (atm && x === atm);
    return true;
  }

  function kpi(label, value, sub, up) {
    const d = document.createElement("div");
    d.className = "fx-card fx-kpi";
    d.innerHTML = `<div class="lbl"></div><div class="val"></div>`;
    d.querySelector(".lbl").textContent = label;
    d.querySelector(".val").textContent = value;
    if (sub) {
      const s = document.createElement("div");
      s.className = "sub " + (up == null ? "" : up ? "fx-up" : "fx-dn");
      s.textContent = sub;
      d.appendChild(s);
    }
    return d;
  }

  function fillSelect(id, options, value) {
    const el = document.getElementById(id);
    if (el.options.length) return;
    options.forEach(([v, t]) => {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = t;
      el.appendChild(o);
    });
    el.value = value;
  }

  function renderPicker() {
    const chips = document.getElementById("s60-chips");
    chips.replaceChildren();
    sorted().forEach((d) => {
      const chip = document.createElement("span");
      chip.className = "fx-chip";
      chip.append(document.createTextNode(d + " "));
      const x = document.createElement("button");
      x.type = "button";
      x.textContent = "×";
      x.disabled = selected.length === 1;
      x.setAttribute("aria-label", "Remove " + d);
      x.addEventListener("click", () => {
        if (selected.length === 1) return;
        selected = selected.filter((k) => k !== d);
        followWindow();
        render();
      });
      chip.appendChild(x);
      chips.appendChild(chip);
    });
    document.getElementById("s60-count").textContent = selected.length + " of " + DATES.length + " sessions";
    const list = document.getElementById("s60-list");
    list.replaceChildren();
    const q = filter.trim();
    let month = "";
    DATES.filter((d) => !q || d.includes(q)).slice().reverse().forEach((d) => {
      const key = d.slice(0, 7);
      if (key !== month) {
        month = key;
        const h = document.createElement("div");
        h.className = "s60-month";
        h.textContent = key;
        list.appendChild(h);
      }
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "option");
      b.textContent = d;
      b.setAttribute("aria-selected", selected.includes(d) ? "true" : "false");
      if (selected.includes(d)) b.className = "on";
      b.addEventListener("click", () => {
        if (selected.includes(d)) {
          if (selected.length === 1) return;
          selected = selected.filter((k) => k !== d);
        } else selected = selected.concat(d);
        followWindow();
        render();
      });
      list.appendChild(b);
    });
    const idx = selected.map((d) => DATES.indexOf(d));
    document.getElementById("s60-prev").disabled = idx.some((i) => i <= 0);
    document.getElementById("s60-next").disabled = idx.some((i) => i < 0 || i >= DATES.length - 1);
    const last = Math.max(...idx);
    document.getElementById("s60-add").disabled = last >= DATES.length - 1 || selected.includes(DATES[last + 1]);
  }

  function renderDaily(days) {
    const spots = document.getElementById("s60-spots");
    spots.replaceChildren();
    const first = days[0];
    const last = days[days.length - 1];
    days.forEach((day, i) => {
      const chg = day.u - first.u;
      const sub = i === 0 ? null : signed(chg, f1) + " (" + signed(chg / first.u * 100, f2) + "%)";
      spots.appendChild(kpi(day.d + " spot", f1(day.u), sub, chg > 0));
    });
    const ax = axis();
    legend("lg-daily", days.map((day, i) => ({ name: day.d, color: color(i) })));
    chart(document.getElementById("ch-daily"), {
      series: days.map((day, i) => ({ name: day.d, color: color(i), pts: smilePts(day) })),
      ...ax, yfmt: f2, yTitle: "Implied Volatility (%)"
    });
    const title = document.getElementById("s60-chg-title");
    const chgEl = document.getElementById("ch-chg");
    if (days.length < 2) {
      title.textContent = "Smile change";
      chgEl.replaceChildren();
      chgEl.textContent = "Select two dates to see the change.";
    } else {
      title.textContent = `Smile Change (ΔIV): ${last.d} vs ${first.d}`;
      const a = smilePts(first);
      const b = smilePts(last);
      chart(chgEl, {
        series: [{ name: "Change", color: UP, bars: true, pts: a.map((p, i) => barPt(p.x, b[i].y - p.y)) }],
        ...ax, yfmt: (v) => signed(v, f2), zero: true, yTitle: "Δ IV (vol pts)"
      });
    }
    const label = (x) => (view === "strike" ? strikeName(x) : deltaName(x)) + " IV";
    paint(document.getElementById("s60-metrics"), headers(days, "Metric"), smilePts(first).map((p, i) => [
      { t: label(p.x) },
      ...vals(days, (day) => smilePts(day)[i].y, f2)
    ]));
    document.getElementById("s60-move-title").textContent = days.length > 1
      ? `Smile Movement Analysis (${first.d} to ${last.d})`
      : "Smile Movement Analysis";
    const move = document.getElementById("s60-move");
    move.replaceChildren();
    const add = (t) => {
      const li = document.createElement("li");
      li.textContent = t;
      move.appendChild(li);
    };
    if (days.length < 2) { add("Add another date to compare the wings."); return; }
    if (view !== "delta") { add("Switch View By to Delta to read the put and call wings."); return; }
    const dPut = ivPut(last, 5) - ivPut(first, 5);
    const dCall = ivCall(last, 5) - ivCall(first, 5);
    const dAtm = atmIv(last) - atmIv(first);
    if (dCall < -0.02 && dPut > 0.05) add("Call wing flattening.");
    else if (dPut > 0.2 && dCall > 0.2) add("Both wings higher.");
    else if (dPut < -0.05 && dCall > 0.02) add("Put wing compressing.");
    else add("Wing move is mixed.");
    add(`ATM IV ${signed(dAtm, f2)} vol.`);
    add(`5Δ put ${signed(dPut, f2)} vol, 5Δ call ${signed(dCall, f2)} vol.`);
    add(`25Δ risk reversal ${signed(rr(last, 25) - rr(first, 25), f2)} vol.`);
  }

  function renderHist() {
    const level = Number(document.getElementById("s60-hist-delta").value);
    document.getElementById("s60-hist-note").textContent = `${level}Δ put versus call, and the risk reversal, ${DATES[0]} through ${DATES[DATES.length - 1]} (${DATES.length} sessions).`;
    document.getElementById("s60-hist-title").textContent = `${level}Δ Implied Volatility (Put vs Call)`;
    document.getElementById("s60-rr-title").textContent = `${level}Δ Risk Reversal (Put − Call)`;
    const every = Math.ceil(DATES.length / 8);
    legend("lg-hist", [{ name: level + "Δ P", color: PAL[0] }, { name: level + "Δ C", color: PAL[1] }]);
    chart(document.getElementById("ch-hist"), {
      series: [
        { name: level + "Δ P", color: PAL[0], pts: DAYS.map((d) => ({ x: d.d, y: ivPut(d, level) })) },
        { name: level + "Δ C", color: PAL[1], pts: DAYS.map((d) => ({ x: d.d, y: ivCall(d, level) })) }
      ],
      cats: DATES, every, marks: selected, xfmt: (d) => d.slice(0, 7), yfmt: f2, yTitle: "Implied Volatility (%)"
    });
    chart(document.getElementById("ch-rr"), {
      series: [{ name: level + "Δ RR", color: PAL[0], pts: DAYS.map((d) => ({ x: d.d, y: rr(d, level) })) }],
      cats: DATES, every, marks: selected, xfmt: (d) => d.slice(0, 7), yfmt: f2, yTitle: "Risk Reversal (vol pts)"
    });
  }

  function renderRegime() {
    const sel = document.getElementById("s60-reg-date");
    if (!sel.options.length) {
      DATES.forEach((d) => {
        const o = document.createElement("option");
        o.value = d;
        o.textContent = d;
        sel.appendChild(o);
      });
    }
    if (!BY.has(regimeDate)) regimeDate = DATES[DATES.length - 1];
    sel.value = regimeDate;
    const i = DATES.indexOf(regimeDate);
    document.getElementById("s60-reg-prev").disabled = i <= 0;
    document.getElementById("s60-reg-next").disabled = i >= DATES.length - 1;
    const day = BY.get(regimeDate);
    const atms = DAYS.map(atmIv).slice().sort((a, b) => a - b);
    const v = atmIv(day);
    const pct = atms.filter((a) => a <= v).length / atms.length * 100;
    const name = pct <= 20 ? "LOW VOL" : pct >= 80 ? "HIGH VOL" : "MID VOL";
    const q = (p) => atms[Math.min(atms.length - 1, Math.max(0, Math.round((atms.length - 1) * p)))];
    const box = document.getElementById("s60-regime");
    box.replaceChildren();
    box.append(
      kpi("Date", day.d),
      kpi("Spot", f1(day.u)),
      kpi("ATM strike", d3.format(",.0f")(day.atm)),
      kpi("ATM IV", f2(v) + "%"),
      kpi("ATM IV percentile", f1(pct) + "%"),
      kpi("Regime", name),
      kpi("20th pct ATM IV", f2(q(0.2)) + "%"),
      kpi("80th pct ATM IV", f2(q(0.8)) + "%")
    );
    const every = Math.ceil(DATES.length / 8);
    chart(document.getElementById("ch-regime"), {
      series: [{ name: "ATM IV", color: PAL[0], pts: DAYS.map((d) => ({ x: d.d, y: atmIv(d) })) }],
      cats: DATES, every, marks: [regimeDate], xfmt: (d) => d.slice(0, 7), yfmt: f2, yTitle: "ATM IV (%)"
    });
  }

  function renderDelta(days) {
    const head = headers(days, "Description");
    head.splice(1, 0, "Formula");
    const spec = [
      ["Volatility level", "V_ATM", (d) => atmIv(d)],
      ["25Δ skew", "V_25P − V_25C", (d) => rr(d, 25)],
      ["10Δ wing skew", "V_10P − V_10C", (d) => rr(d, 10)],
      ["25Δ curvature", "V_25P + V_25C − 2 V_ATM", (d) => ivPut(d, 25) + ivCall(d, 25) - 2 * atmIv(d)],
      ["10Δ curvature", "V_10P + V_10C − 2 V_ATM", (d) => ivPut(d, 10) + ivCall(d, 10) - 2 * atmIv(d)],
      ["Put-side slope", "V_25P − V_ATM", (d) => ivPut(d, 25) - atmIv(d)],
      ["Call-side slope", "V_ATM − V_25C", (d) => atmIv(d) - ivCall(d, 25)],
      ["Put-wing slope", "V_10P − V_25P", (d) => ivPut(d, 10) - ivPut(d, 25)],
      ["Call-wing slope", "V_25C − V_10C", (d) => ivCall(d, 25) - ivCall(d, 10)],
      ["Wing curvature", "V_10P + V_10C − V_25P − V_25C", (d) => ivPut(d, 10) + ivCall(d, 10) - ivPut(d, 25) - ivCall(d, 25)]
    ];
    paint(document.getElementById("s60-combo"), head, spec.map(([name, formula, fn]) => [
      { t: name }, { t: formula }, ...vals(days, fn, f4)
    ]));
    paint(document.getElementById("s60-spotinfo"), ["Date", "Spot", "ATM strike", "ATM IV (%)"], days.map((d) => [
      { t: d.d }, { t: f1(d.u) }, { t: d3.format(",.0f")(d.atm) }, { t: f2(atmIv(d)) }
    ]));
    const ax = axis();
    ax.xdom = view === "strike" ? ax.xdom : [-0.3, 100.3];
    legend("lg-delta", days.map((d, i) => ({ name: d.d, color: color(i) })));
    const saved = view;
    view = "delta";
    const pts = (day) => DX.map((x, i) => ({ x, y: day.iv[i] }));
    view = saved;
    chart(document.getElementById("ch-delta"), {
      series: days.map((day, i) => ({ name: day.d, color: color(i), pts: pts(day) })),
      xdom: [-0.3, 100.3], xticks: [5, 10, 25, 50, 75, 90, 95], xfmt: deltaName, yfmt: f2, yTitle: "Implied Volatility (%)"
    });
    const a = Number(document.getElementById("s60-d1").value);
    const b = Number(document.getElementById("s60-d2").value);
    document.getElementById("s60-delta-note").textContent = `${a}Δ against ${b}Δ on each selected session. Diff is the first delta minus the second.`;
    const pairHead = ["Date",
      a + "Δ Put", b + "Δ Put", `Put diff (${a}−${b})`,
      a + "Δ Call", b + "Δ Call", `Call diff (${a}−${b})`,
      a + "Δ RR", b + "Δ RR", `RR diff (${a}−${b})`,
      a + "Δ BF", b + "Δ BF", `BF diff (${a}−${b})`];
    paint(document.getElementById("s60-dpair"), pairHead, days.map((d) => [
      { t: d.d },
      { t: f2(ivPut(d, a)) }, { t: f2(ivPut(d, b)) }, { t: f2(ivPut(d, a) - ivPut(d, b)) },
      { t: f2(ivCall(d, a)) }, { t: f2(ivCall(d, b)) }, { t: f2(ivCall(d, a) - ivCall(d, b)) },
      { t: f2(rr(d, a)) }, { t: f2(rr(d, b)) }, { t: f2(rr(d, a) - rr(d, b)) },
      { t: f2(bf(d, a)) }, { t: f2(bf(d, b)) }, { t: f2(bf(d, a) - bf(d, b)) }
    ]));
  }

  function renderStruct(days) {
    const host = document.getElementById("s60-struct");
    host.replaceChildren();
    const h = (label) => headers(days, label);
    const row = (name, fn, fmt) => [{ t: name }, ...vals(days, fn, fmt)];
    block(host, "Market & Core Smile", h("Measure"), [
      row("Spot", (d) => d.u, f1),
      row("ATM IV", atmIv, f4),
      row("25Δ risk reversal", (d) => rr(d, 25), f4)
    ]);
    block(host, "Skew Structure", h("Measure"), [
      row("Put-side skew", (d) => ivPut(d, 25) - atmIv(d), f4),
      row("Put-wing skew", (d) => ivPut(d, 10) - ivPut(d, 25), f4),
      row("Call-side skew", (d) => atmIv(d) - ivCall(d, 25), f4),
      row("Call-wing skew", (d) => ivCall(d, 25) - ivCall(d, 10), f4)
    ]);
    const putSpreads = [];
    const callSpreads = [];
    for (let i = 0; i < DELTA_LEVELS.length - 1; i++) {
      const lo = DELTA_LEVELS[i];
      const hi = DELTA_LEVELS[i + 1];
      putSpreads.push(row(lo + "P − " + hi + "P", (d) => ivPut(d, lo) - ivPut(d, hi), f4));
    }
    for (let i = DELTA_LEVELS.length - 1; i > 0; i--) {
      const hi = DELTA_LEVELS[i];
      const lo = DELTA_LEVELS[i - 1];
      callSpreads.push(row(hi + "C − " + lo + "C", (d) => ivCall(d, hi) - ivCall(d, lo), f4));
    }
    block(host, "5Δ Smile Spreads — Put Wing", h("Smile spread"), putSpreads);
    block(host, "5Δ Smile Spreads — Call Wing", h("Smile spread"), callSpreads);
    block(host, "All Risk Reversals", h("Measure"), DELTA_LEVELS.map((n) => row(n + "Δ risk reversal", (d) => rr(d, n), f4)));
    block(host, "All Butterflies", h("Measure"), DELTA_LEVELS.map((n) => row(n + "Δ butterfly", (d) => bf(d, n), f4)));
  }

  function catalog() {
    const out = [];
    const add = (cat, name, y, fmt) => out.push({ cat, id: cat + "|" + name, name, y, fmt: fmt || f2 });
    add("Market & core", "Spot", (d) => d.u, (v) => d3.format(",.2f")(v));
    add("Market & core", "ATM IV", atmIv, f2);
    add("Market & core", "25Δ risk reversal", (d) => rr(d, 25), f2);
    add("Skew", "Put-side skew", (d) => ivPut(d, 25) - atmIv(d), f2);
    add("Skew", "Put-wing skew", (d) => ivPut(d, 10) - ivPut(d, 25), f2);
    add("Skew", "Call-side skew", (d) => atmIv(d) - ivCall(d, 25), f2);
    add("Skew", "Call-wing skew", (d) => ivCall(d, 25) - ivCall(d, 10), f2);
    DELTA_LEVELS.forEach((n) => add("Risk reversals", n + "Δ risk reversal", (d) => rr(d, n), f2));
    DELTA_LEVELS.forEach((n) => add("Butterflies", n + "Δ butterfly", (d) => bf(d, n), f4));
    for (let i = 0; i < DELTA_LEVELS.length - 1; i++) {
      const lo = DELTA_LEVELS[i];
      const hi = DELTA_LEVELS[i + 1];
      add("Put spreads", lo + "P − " + hi + "P", (d) => ivPut(d, lo) - ivPut(d, hi), f2);
    }
    for (let i = DELTA_LEVELS.length - 1; i > 0; i--) {
      const hi = DELTA_LEVELS[i];
      const lo = DELTA_LEVELS[i - 1];
      add("Call spreads", hi + "C − " + lo + "C", (d) => ivCall(d, hi) - ivCall(d, lo), f2);
    }
    return out;
  }

  function syncMetrics() {
    const cat = document.getElementById("s60-cat").value;
    const el = document.getElementById("s60-metric");
    const prev = el.value;
    const items = catalog().filter((m) => m.cat === cat);
    el.replaceChildren();
    items.forEach((m) => {
      const o = document.createElement("option");
      o.value = m.id;
      o.textContent = m.name;
      el.appendChild(o);
    });
    if (items.some((m) => m.id === prev)) el.value = prev;
  }

  function renderTs(days) {
    syncMetrics();
    const spec = catalog().find((m) => m.id === document.getElementById("s60-metric").value) || catalog()[0];
    document.getElementById("s60-ts-title").textContent = "Time Series: " + spec.name;
    chart(document.getElementById("ch-spot"), {
      series: [{ name: spec.name, color: PAL[0], pts: DAYS.map((d) => ({ x: d.d, y: spec.y(d) })) }],
      cats: DATES, every: Math.ceil(DATES.length / 8), marks: selected, xfmt: (d) => d.slice(0, 7), yfmt: spec.fmt, yTitle: spec.name
    });
    paint(document.getElementById("s60-ts-tbl"), headers(days, "Metric"), [
      [{ t: spec.name }, ...vals(days, spec.y, spec.fmt)]
    ]);
  }

  const flyNav = {
    delta: { day: "2026-09-28", a: "2026-09-25", b: "2026-09-28" },
    fix: { day: "2026-09-28", a: "2026-09-25", b: "2026-09-28" }
  };

  function ensureDates(id, value) {
    const el = document.getElementById(id);
    if (!el.options.length) {
      DATES.forEach((d) => {
        const o = document.createElement("option");
        o.value = d;
        o.textContent = d;
        el.appendChild(o);
      });
    }
    if (BY.has(value)) el.value = value;
    return el.value;
  }

  function stepDate(d, n) {
    const i = DATES.indexOf(d) + n;
    if (i < 0 || i >= DATES.length) return d;
    return DATES[i];
  }

  function renderFlyDays(kind) {
    const st = flyNav[kind];
    const delta = kind === "delta";
    const p = delta
      ? { date: "s60-fd-date", prev: "s60-fd-prev", next: "s60-fd-next", a: "s60-fc-a", b: "s60-fc-b", ap: "s60-fc-prev", an: "s60-fc-next", lgD: "lg-fd", chD: "ch-fd", lgC: "lg-fc", chC: "ch-fc", tbl: "s60-fc-tbl" }
      : { date: "s60-xd-date", prev: "s60-xd-prev", next: "s60-xd-next", a: "s60-xc-a", b: "s60-xc-b", ap: "s60-xc-prev", an: "s60-xc-next", lgD: "lg-xd", chD: "ch-xd", lgC: "lg-xc", chC: "ch-xc", tbl: "s60-xc-tbl" };
    st.day = ensureDates(p.date, st.day);
    st.a = ensureDates(p.a, st.a);
    st.b = ensureDates(p.b, st.b);
    document.getElementById(p.prev).disabled = DATES.indexOf(st.day) <= 0;
    document.getElementById(p.next).disabled = DATES.indexOf(st.day) >= DATES.length - 1;
    const ia = DATES.indexOf(st.a);
    const ib = DATES.indexOf(st.b);
    document.getElementById(p.ap).disabled = ia <= 0 || ib <= 0;
    document.getElementById(p.an).disabled = ia >= DATES.length - 1 || ib >= DATES.length - 1;
    const side = document.getElementById(delta ? "s60-fly-side" : "s60-fix-side").value;
    const curve = (day) => {
      if (delta) {
        const keep = (pt) => side === "put" ? pt.x < 50 : side === "call" ? pt.x > 50 : true;
        return flies(day).filter(keep);
      }
      const keep = (pt) => side === "put" ? pt.x < 0 : side === "call" ? pt.x > 0 : pt.x !== 0;
      return fixedFlies(day).filter(keep);
    };
    const xfmt = delta ? flyName : strikeName;
    const one = curve(BY.get(st.day));
    legend(p.lgD, [{ name: st.day, color: PAL[0] }]);
    chart(document.getElementById(p.chD), {
      series: [{ name: st.day, color: PAL[0], pts: one }],
      cats: one.map((pt) => pt.x), every: 1, xfmt, yfmt: f4, yTitle: "IV fly"
    });
    const pa = curve(BY.get(st.a));
    const pb = curve(BY.get(st.b));
    const cats = pa.map((pt) => pt.x);
    legend(p.lgC, [{ name: st.a, color: PAL[0] }, { name: st.b, color: PAL[1] }]);
    chart(document.getElementById(p.chC), {
      series: [
        { name: st.a, color: PAL[0], pts: pa },
        { name: st.b, color: PAL[1], pts: pb }
      ],
      cats, every: 1, xfmt, yfmt: f4, yTitle: "IV fly"
    });
    paint(document.getElementById(p.tbl), [delta ? "Delta" : "Offset", st.a, st.b, "B − A"], cats.map((x, i) => {
      const diff = pb[i].y - pa[i].y;
      return [
        { t: xfmt(x) },
        { t: f4(pa[i].y) },
        { t: f4(pb[i].y) },
        { t: signed(diff, f4), cls: cls(diff) }
      ];
    }));
  }

  function renderFly(days) {
    renderFlyDays("delta");
    const side = document.getElementById("s60-fly-side").value;
    const first = days[0];
    const last = days[days.length - 1];
    const box = document.getElementById("s60-fly-kpis");
    box.replaceChildren();
    box.append(
      kpi("Spot " + last.d, f1(last.u), days.length > 1 ? signed(last.u - first.u, f1) + " (" + signed((last.u - first.u) / first.u * 100, f2) + "%)" : null, last.u > first.u),
      kpi("ATM IV " + last.d, f2(atmIv(last)), days.length > 1 ? signed(atmIv(last) - atmIv(first), f2) + " vol" : null, atmIv(last) > atmIv(first))
    );
    const keep = (p) => side === "put" ? p.x < 50 : side === "call" ? p.x > 50 : true;
    legend("lg-fly", days.map((d, i) => ({ name: d.d + " " + (side === "all" ? "full smile" : side), color: color(i) })));
    const cats = flies(first).map((p) => p.x).filter((x) => keep({ x }));
    chart(document.getElementById("ch-fly"), {
      series: days.map((day, i) => ({ name: day.d, color: color(i), pts: flies(day).filter(keep) })),
      cats, every: 1, xfmt: flyName, yfmt: f4, yTitle: "IV fly"
    });
    const title = document.getElementById("s60-flychg-title");
    const el = document.getElementById("ch-flychg");
    const notes = document.getElementById("s60-fly-notes");
    notes.replaceChildren();
    const add = (t) => {
      const li = document.createElement("li");
      li.textContent = t;
      notes.appendChild(li);
    };
    paint(document.getElementById("s60-fly-tbl"), headers(days, "Delta"), cats.map((x) => [
      { t: flyName(x) },
      ...vals(days, (d) => flies(d).find((p) => p.x === x).y, f4)
    ]));
    if (days.length < 2) {
      title.textContent = "Fly value change";
      el.replaceChildren();
      add("Add another date to compare flies.");
      return;
    }
    title.textContent = `Fly Value Change: ${last.d} vs ${first.d}`;
    const a = flies(first).filter(keep);
    const b = flies(last).filter(keep);
    chart(el, {
      series: [{ name: "Change", color: UP, bars: true, pts: a.map((p, i) => barPt(p.x, b[i].y - p.y)) }],
      cats, every: 1, xfmt: flyName, yfmt: (v) => signed(v, f4), zero: true, yTitle: "Δ IV fly"
    });
    const at = (level, wing) => {
      const x = wing === "put" ? level : 100 - level;
      const ai = flies(first).find((p) => p.x === x).y;
      const bi = flies(last).find((p) => p.x === x).y;
      return bi - ai;
    };
    const p30 = at(30, "put");
    const p45 = at(45, "put");
    const c25 = at(25, "call");
    add(`30Δ put fly ${p30 < 0 ? "decreased" : "increased"} by ${f4(Math.abs(p30))} over the selected period.`);
    if (Math.abs(p45) >= 0.05) add(`45Δ put fly changed materially (${signed(p45, f4)}), indicating a shift in curvature between 40Δ, 45Δ, and ATM.`);
    else add(`45Δ put fly changed ${signed(p45, f4)}.`);
    add(`25Δ call fly became ${c25 >= 0 ? "more positive" : "more negative"} (change: ${signed(c25, f4)}).`);
    const diffs = a.map((p, i) => ({ x: p.x, y: b[i].y - p.y }));
    const putMag = diffs.filter((p) => p.x < 50).reduce((s, p) => s + Math.abs(p.y), 0);
    const callMag = diffs.filter((p) => p.x > 50).reduce((s, p) => s + Math.abs(p.y), 0);
    if (putMag && callMag) add(putMag > callMag
      ? "Put-side fly curvature changed substantially more than call-side fly curvature."
      : "Call-side fly curvature changed substantially more than put-side fly curvature.");
  }

  function renderFix(days) {
    renderFlyDays("fix");
    const side = document.getElementById("s60-fix-side").value;
    const first = days[0];
    const last = days[days.length - 1];
    const rr400 = (d) => siv(d, -400) - siv(d, 400);
    const fly = (d) => (siv(d, -700) + siv(d, 700)) / 2 - atmIv(d);
    const box = document.getElementById("s60-fix-kpis");
    box.replaceChildren();
    box.append(
      kpi("Spot change", f1(last.u), days.length > 1 ? signed(last.u - first.u, f1) + " (" + signed((last.u - first.u) / first.u * 100, f2) + "%)" : null, last.u > first.u),
      kpi("ATM IV change", f2(atmIv(last)) + "%", days.length > 1 ? signed(atmIv(last) - atmIv(first), f4) + " vol" : null, atmIv(last) > atmIv(first)),
      kpi("Skew — RR ATM±400", f4(rr400(last)) + "%", days.length > 1 ? signed(rr400(last) - rr400(first), f4) + " pts" : null, rr400(last) > rr400(first)),
      kpi("Curvature — ATM fly", f4(fly(last)) + "%", days.length > 1 ? signed(fly(last) - fly(first), f4) + " pts" : null, fly(last) > fly(first))
    );
    const keep = (p) => side === "put" ? p.x < 0 : side === "call" ? p.x > 0 : p.x !== 0;
    const cats = fixedFlies(first).map((p) => p.x).filter((x) => keep({ x }));
    const series = [];
    const legs = [];
    days.forEach((day, i) => {
      if (side !== "call") {
        series.push({ name: day.d + " Put", color: color(i), pts: fixedFlies(day).filter((p) => p.x < 0) });
        legs.push({ name: day.d + " Put", color: color(i) });
      }
      if (side !== "put") {
        series.push({ name: day.d + " Call", color: color(i), dash: side === "all", pts: fixedFlies(day).filter((p) => p.x > 0) });
        legs.push({ name: day.d + " Call", color: color(i) });
      }
    });
    legend("lg-fix", legs);
    chart(document.getElementById("ch-fix"), {
      series, cats, every: 1, xfmt: strikeName, yfmt: f4, yTitle: "IV fly (vol pts)"
    });
    const title = document.getElementById("s60-fixchg-title");
    const el = document.getElementById("ch-fixchg");
    paint(document.getElementById("s60-fix-tbl"), headers(days, "Offset"), cats.map((x) => [
      { t: strikeName(x) },
      ...vals(days, (d) => fixedFlies(d).find((p) => p.x === x).y, f4)
    ]));
    if (days.length < 2) {
      title.textContent = "Fly value change";
      el.replaceChildren();
      return;
    }
    title.textContent = `Fly Value Change: ${last.d} vs ${first.d}`;
    const a = fixedFlies(first).filter(keep);
    const b = fixedFlies(last).filter(keep);
    chart(el, {
      series: [{ name: "Δ Fly", color: UP, bars: true, pts: a.map((p, i) => barPt(p.x, b[i].y - p.y)) }],
      cats, every: 1, xfmt: strikeName, yfmt: (v) => signed(v, f4), zero: true, yTitle: "Change in IV fly"
    });
  }

  function spreadPairs(wing) {
    const out = [];
    if (wing !== "put") {
      for (let k = 0; k <= 800; k += 100) out.push({ wing: "call", a: k, b: k + 100 });
    }
    if (wing !== "call") {
      for (let k = 100; k <= 800; k += 100) out.push({ wing: "put", a: -k, b: -(k + 100) });
    }
    return out;
  }
  function spr(day, pair) { return prem(day, pair.a) - prem(day, pair.b); }
  function sprName(pair) { return strikeName(pair.a) + " / " + strikeName(pair.b); }

  function renderSpr(days) {
    const wing = document.getElementById("s60-spr-wing").value;
    const first = days[0];
    const last = days[days.length - 1];
    const box = document.getElementById("s60-spr-kpis");
    box.replaceChildren();
    const callNear = { a: 100, b: 200 };
    const putNear = { a: -100, b: -200 };
    box.append(
      kpi("Spot", f1(last.u), days.length > 1 ? signed(last.u - first.u, f1) + " (" + signed((last.u - first.u) / first.u * 100, f2) + "%)" : null, last.u > first.u),
      kpi("ATM IV", f2(atmIv(last)) + "%", days.length > 1 ? signed(atmIv(last) - atmIv(first), f4) + " vol" : null, atmIv(last) > atmIv(first)),
      kpi("ATM+100/200 call spread", "$" + f2(spr(last, callNear)), days.length > 1 ? signed(spr(last, callNear) - spr(first, callNear), f2) + " pts" : null, spr(last, callNear) > spr(first, callNear)),
      kpi("ATM−100/200 put spread", "$" + f2(spr(last, putNear)), days.length > 1 ? signed(spr(last, putNear) - spr(first, putNear), f2) + " pts" : null, spr(last, putNear) > spr(first, putNear))
    );
    function wingChart(which, lg, ch, chg, titleId) {
      const pairs = spreadPairs(which);
      const cats = pairs.map(sprName);
      const show = wing === "all" || wing === which;
      document.getElementById(ch).style.display = show ? "" : "none";
      document.getElementById(chg).style.display = show ? "" : "none";
      if (!show) return;
      legend(lg, days.map((d, i) => ({ name: d.d, color: color(i) })));
      chart(document.getElementById(ch), {
        series: days.map((day, i) => ({ name: day.d, color: color(i), pts: pairs.map((p) => ({ x: sprName(p), y: spr(day, p) })) })),
        cats, every: 1, yfmt: (v) => d3.format(",.2f")(v), yTitle: "Spread ($)"
      });
      const title = document.getElementById(titleId);
      if (days.length < 2) {
        title.textContent = "Spread change";
        document.getElementById(chg).replaceChildren();
        return;
      }
      title.textContent = `Premium spread change: ${last.d} vs ${first.d}`;
      chart(document.getElementById(chg), {
        series: [{
          name: "Change", color: UP, bars: true,
          pts: pairs.map((p) => barPt(sprName(p), spr(last, p) - spr(first, p)))
        }],
        cats, every: 1, yfmt: (v) => signed(v, f2), zero: true, yTitle: "Change ($)"
      });
    }
    wingChart("call", "lg-sprc", "ch-sprc", "ch-sprcchg", "s60-sprc-title");
    wingChart("put", "lg-sprp", "ch-sprp", "ch-sprpchg", "s60-sprp-title");
    const pairs = spreadPairs(wing);
    paint(document.getElementById("s60-spr-tbl"), headers(days, "Spread"), pairs.map((p) => [
      { t: (p.wing === "call" ? "Call " : "Put ") + sprName(p) },
      ...vals(days, (d) => spr(d, p), f2)
    ]));
  }

  const premNav = {
    delta: { day: "2026-09-28", a: "2026-09-25", b: "2026-09-28" },
    strike: { day: "2026-09-28", a: "2026-09-25", b: "2026-09-28" }
  };

  function followWindow() {
    const days = selected.slice().sort();
    const first = days[0];
    const last = days[days.length - 1];
    [flyNav.delta, flyNav.fix, premNav.delta, premNav.strike].forEach((st) => {
      st.a = first;
      st.b = last;
      st.day = last;
    });
    regimeDate = last;
    monthKey = last.slice(0, 7);
  }

  function renderPrem(kind) {
    const st = premNav[kind];
    const delta = kind === "delta";
    const p = delta
      ? { date: "s60-pd-date", prev: "s60-pd-prev", next: "s60-pd-next", a: "s60-pc-a", b: "s60-pc-b", ap: "s60-pc-prev", an: "s60-pc-next", lgD: "lg-pd", chD: "ch-pd", lgC: "lg-pc", chC: "ch-pc", chg: "ch-pcchg", title: "s60-pcchg-title", tbl: "s60-pc-tbl" }
      : { date: "s60-sd-date", prev: "s60-sd-prev", next: "s60-sd-next", a: "s60-sc-a", b: "s60-sc-b", ap: "s60-sc-prev", an: "s60-sc-next", lgD: "lg-sd", chD: "ch-sd", lgC: "lg-sc", chC: "ch-sc", chg: "ch-scchg", title: "s60-scchg-title", tbl: "s60-sc-tbl" };
    st.day = ensureDates(p.date, st.day);
    st.a = ensureDates(p.a, st.a);
    st.b = ensureDates(p.b, st.b);
    document.getElementById(p.prev).disabled = DATES.indexOf(st.day) <= 0;
    document.getElementById(p.next).disabled = DATES.indexOf(st.day) >= DATES.length - 1;
    const ia = DATES.indexOf(st.a);
    const ib = DATES.indexOf(st.b);
    document.getElementById(p.ap).disabled = ia <= 0 || ib <= 0;
    document.getElementById(p.an).disabled = ia >= DATES.length - 1 || ib >= DATES.length - 1;
    const curve = (day) => delta
      ? DX.map((x, i) => ({ x, y: day.dp[i] }))
      : SX.map((x, i) => ({ x, y: day.sp[i] }));
    const xfmt = delta ? deltaName : strikeName;
    const yfmt = (v) => d3.format(",.2f")(v);
    const one = curve(BY.get(st.day));
    legend(p.lgD, [{ name: st.day, color: PAL[0] }]);
    chart(document.getElementById(p.chD), {
      series: [{ name: st.day, color: PAL[0], pts: one }],
      cats: one.map((pt) => pt.x), every: delta ? 2 : 2, xfmt, yfmt, yTitle: "Premium (pts)"
    });
    const pa = curve(BY.get(st.a));
    const pb = curve(BY.get(st.b));
    const cats = pa.map((pt) => pt.x);
    legend(p.lgC, [{ name: st.a, color: PAL[0] }, { name: st.b, color: PAL[1] }]);
    chart(document.getElementById(p.chC), {
      series: [
        { name: st.a, color: PAL[0], pts: pa },
        { name: st.b, color: PAL[1], pts: pb }
      ],
      cats, every: 2, xfmt, yfmt, yTitle: "Premium (pts)"
    });
    document.getElementById(p.title).textContent = `Premium change: ${st.b} vs ${st.a}`;
    chart(document.getElementById(p.chg), {
      series: [{ name: "Change", color: UP, bars: true, pts: pa.map((pt, i) => barPt(pt.x, pb[i].y - pt.y)) }],
      cats, every: 2, xfmt, yfmt: (v) => signed(v, f2), zero: true, yTitle: "Change (pts)"
    });
    paint(document.getElementById(p.tbl), [delta ? "Delta" : "Offset", st.a, st.b, "B − A"], cats.map((x, i) => {
      const diff = pb[i].y - pa[i].y;
      return [
        { t: xfmt(x) },
        { t: yfmt(pa[i].y) },
        { t: yfmt(pb[i].y) },
        { t: signed(diff, f2), cls: cls(diff) }
      ];
    }));
  }

  const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const FLY_X = DX.filter((x) => x !== DX[0] && x !== DX[DX.length - 1]);
  const FLY_PAL = ["#1f4e79", "#2e75b6", "#c45911", "#ed7d31", "#548235", "#70ad47", "#7030a0", "#c00000", "#833c0c", "#203864", "#0d7377", "#9a6b2f", "#3d5a80", "#6b2d5b", "#2f5d50", "#8a4b08", "#1f9d55"];

  function monthLabel(key) {
    const [y, m] = key.split("-");
    return MONTH_NAMES[Number(m) - 1] + " " + y;
  }

  function sessionBefore(date) {
    const i = DATES.indexOf(date);
    return i > 0 ? BY.get(DATES[i - 1]) : null;
  }

  function flyIv(day, x) {
    const i = DX.indexOf(x);
    return (day.iv[i - 1] + day.iv[i + 1]) / 2 - day.iv[i];
  }

  function flyPx(day, x) {
    const i = DX.indexOf(x);
    return day.dp[i - 1] + day.dp[i + 1] - 2 * day.dp[i];
  }

  function monthRows() {
    const rows = [];
    const add = (group, name, fn, fmt) => rows.push({ group, name, fn, fmt });
    add("Market", "Spot", (d) => d.u, f1);
    add("Market", "ATM vol", atmIv, f2);
    add("Skew", "25Δ risk reversal", (d) => rr(d, 25), f2);
    add("Skew", "10Δ risk reversal", (d) => rr(d, 10), f2);
    add("Skew", "25Δ put skew", (d) => ivPut(d, 25) - atmIv(d), f2);
    add("Skew", "25Δ call skew", (d) => atmIv(d) - ivCall(d, 25), f2);
    add("Skew", "10Δ put skew", (d) => ivPut(d, 10) - atmIv(d), f2);
    add("Skew", "10Δ call skew", (d) => atmIv(d) - ivCall(d, 10), f2);
    add("Kurtosis", "25Δ kurtosis", (d) => ivPut(d, 25) + ivCall(d, 25) - 2 * atmIv(d), f2);
    add("Kurtosis", "10Δ kurtosis", (d) => ivPut(d, 10) + ivCall(d, 10) - 2 * atmIv(d), f2);
    add("Kurtosis", "Wing kurtosis", (d) => ivPut(d, 10) + ivCall(d, 10) - ivPut(d, 25) - ivCall(d, 25), f2);
    FLY_X.forEach((x) => add("Fly IV", flyName(x) + " fly IV", (d) => flyIv(d, x), f4));
    FLY_X.forEach((x) => add("Fly premium", flyName(x) + " fly premium", (d) => flyPx(d, x), f2));
    return rows;
  }

  function flyChoice() {
    const mode = document.getElementById("s60-month-fly").value;
    if (mode === "put") return FLY_X.filter((x) => x < 50);
    if (mode === "call") return FLY_X.filter((x) => x > 50);
    if (mode === "all") return FLY_X.slice();
    return [10, 25, 50, 75, 90];
  }

  function ensureMonth(selectId) {
    const sel = document.getElementById(selectId);
    if (!sel.options.length) {
      const keys = [];
      DATES.forEach((d) => {
        const key = d.slice(0, 7);
        if (keys[keys.length - 1] !== key) keys.push(key);
      });
      keys.forEach((key) => {
        const o = document.createElement("option");
        o.value = key;
        o.textContent = monthLabel(key);
        sel.appendChild(o);
      });
    }
    if (!monthKey) monthKey = sorted()[sorted().length - 1].slice(0, 7);
    if ([...sel.options].some((o) => o.value === monthKey)) sel.value = monthKey;
    else monthKey = sel.value;
    return DAYS.filter((d) => d.d.slice(0, 7) === monthKey);
  }

  function paintDayTable(table, days, rows) {
    const th = table.querySelector("thead");
    const tb = table.querySelector("tbody");
    th.replaceChildren();
    tb.replaceChildren();
    const hr = document.createElement("tr");
    ["Measure", ...days.map((d) => {
      const dt = new Date(d.d + "T12:00:00");
      return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dt.getDay()] + " " + d.d.slice(8);
    })].forEach((label, i) => {
      const h = document.createElement("th");
      h.textContent = label;
      if (i > 0) h.title = days[i - 1].d;
      hr.appendChild(h);
    });
    th.appendChild(hr);
    let group = "";
    rows.forEach((row) => {
      if (row.group !== group) {
        group = row.group;
        const gr = document.createElement("tr");
        gr.className = "s60-grp";
        const gd = document.createElement("td");
        gd.textContent = group;
        gr.appendChild(gd);
        days.forEach(() => gr.appendChild(document.createElement("td")));
        tb.appendChild(gr);
      }
      const tr = document.createElement("tr");
      if (row.cls) tr.className = row.cls;
      const name = document.createElement("td");
      name.textContent = row.name;
      tr.appendChild(name);
      days.forEach((day) => {
        const td = document.createElement("td");
        const level = document.createElement("div");
        level.textContent = row.fmt(row.fn(day));
        const prev = sessionBefore(day.d);
        const sub = document.createElement("div");
        sub.className = "s60-chg";
        if (prev) {
          const diff = row.fn(day) - row.fn(prev);
          sub.textContent = signed(diff, row.fmt);
          if (cls(diff)) sub.classList.add(cls(diff));
        } else sub.textContent = "—";
        td.append(level, sub);
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
  }

  function offsetName(off) {
    if (off === 0) return "ATM";
    return off > 0 ? "ATM +" + off : "ATM −" + Math.abs(off);
  }

  const STRIKE_DIST = SX.filter((off) => off > 0);
  function strikeAtmVol(day) { return siv(day, 0); }
  function strikeRr(day, k) { return siv(day, -k) - siv(day, k); }
  function strikePutSkew(day, k) { return siv(day, -k) - siv(day, 0); }
  function strikeCallSkew(day, k) { return siv(day, 0) - siv(day, k); }
  function strikeKurt(day, k) { return siv(day, -k) + siv(day, k) - 2 * siv(day, 0); }

  function atmRows() {
    const rows = [];
    rows.push({ group: "Market", name: "Spot", fn: (d) => d.u, fmt: f1 });
    rows.push({ group: "Market", name: "ATM vol", fn: strikeAtmVol, fmt: f2, cls: "atm" });
    STRIKE_DIST.forEach((k) => {
      rows.push({ group: "Skew", name: "ATM ±" + k + " risk reversal", fn: (d) => strikeRr(d, k), fmt: f2 });
      rows.push({ group: "Skew", name: offsetName(-k) + " skew", fn: (d) => strikePutSkew(d, k), fmt: f2 });
      rows.push({ group: "Skew", name: offsetName(k) + " skew", fn: (d) => strikeCallSkew(d, k), fmt: f2 });
    });
    STRIKE_DIST.forEach((k) => {
      rows.push({ group: "Kurtosis", name: "ATM ±" + k + " kurtosis", fn: (d) => strikeKurt(d, k), fmt: f2 });
    });
    SX.forEach((off) => {
      rows.push({ group: "Implied vol", name: offsetName(off) + " IV", fn: (d) => siv(d, off), fmt: f2, cls: off === 0 ? "atm" : "" });
    });
    SX.forEach((off) => {
      rows.push({ group: "Premium", name: offsetName(off) + " premium", fn: (d) => prem(d, off), fmt: f2, cls: off === 0 ? "atm" : "" });
    });
    SX.forEach((off) => {
      if (strikeFlyIv(DAYS[0], off) == null) return;
      rows.push({ group: "Fly IV", name: offsetName(off) + " fly IV", fn: (d) => strikeFlyIv(d, off), fmt: f4, cls: off === 0 ? "atm" : "" });
    });
    SX.forEach((off) => {
      if (strikeFlyPx(DAYS[0], off) == null) return;
      rows.push({ group: "Fly premium", name: offsetName(off) + " fly premium", fn: (d) => strikeFlyPx(d, off), fmt: f2, cls: off === 0 ? "atm" : "" });
    });
    return rows;
  }

  function atmChoice() {
    const mode = document.getElementById("s60-atm-span").value;
    if (mode === "near") return SX.filter((x) => Math.abs(x) <= 200);
    if (mode === "mid") return SX.filter((x) => Math.abs(x) <= 400);
    if (mode === "put") return SX.filter((x) => x <= 0);
    if (mode === "call") return SX.filter((x) => x >= 0);
    return SX.slice();
  }

  function renderMonth() {
    const days = ensureMonth("s60-month");
    syncMonthButtons();
    paintDayTable(document.getElementById("s60-month-tbl"), days, monthRows());

    const cats = days.map((d) => d.d);
    const every = Math.max(1, Math.ceil(days.length / 8));
    const xfmt = (d) => d.slice(8);
    const levelChart = (id, lg, series, yfmt, yTitle) => {
      legend(lg, series.map((s) => ({ name: s.name, color: s.color })));
      chart(document.getElementById(id), {
        series: series.map((s) => ({ name: s.name, color: s.color, pts: days.map((d) => ({ x: d.d, y: s.fn(d) })) })),
        cats, every, xfmt, yfmt, yTitle
      });
    };
    const changeChart = (id, fn, yfmt, yTitle) => {
      chart(document.getElementById(id), {
        series: [{
          name: "Change", color: UP, bars: true,
          pts: days.map((d) => {
            const prev = sessionBefore(d.d);
            if (!prev) return { x: d.d, y: null };
            return barPt(d.d, fn(d) - fn(prev));
          })
        }],
        cats, every, xfmt, yfmt: (v) => signed(v, yfmt), zero: true, yTitle
      });
    };
    levelChart("ch-m-spot", "lg-m-spot", [{ name: "Spot", color: PAL[0], fn: (d) => d.u }], f1, "Spot");
    changeChart("ch-m-spotchg", (d) => d.u, f1, "Spot change");
    levelChart("ch-m-atm", "lg-m-atm", [{ name: "ATM vol", color: PAL[1], fn: atmIv }], f2, "ATM vol (%)");
    changeChart("ch-m-atmchg", atmIv, f2, "ATM vol change");
    levelChart("ch-m-skew", "lg-m-skew", [
      { name: "25Δ risk reversal", color: PAL[0], fn: (d) => rr(d, 25) },
      { name: "10Δ risk reversal", color: PAL[1], fn: (d) => rr(d, 10) },
      { name: "25Δ put skew", color: PAL[2], fn: (d) => ivPut(d, 25) - atmIv(d) },
      { name: "25Δ call skew", color: PAL[3], fn: (d) => atmIv(d) - ivCall(d, 25) }
    ], f2, "Skew (vol pts)");
    changeChart("ch-m-skewchg", (d) => rr(d, 25), f2, "25Δ RR change");
    levelChart("ch-m-kurt", "lg-m-kurt", [
      { name: "25Δ kurtosis", color: PAL[0], fn: (d) => ivPut(d, 25) + ivCall(d, 25) - 2 * atmIv(d) },
      { name: "10Δ kurtosis", color: PAL[1], fn: (d) => ivPut(d, 10) + ivCall(d, 10) - 2 * atmIv(d) },
      { name: "Wing kurtosis", color: PAL[2], fn: (d) => ivPut(d, 10) + ivCall(d, 10) - ivPut(d, 25) - ivCall(d, 25) }
    ], f2, "Kurtosis (vol pts)");
    changeChart("ch-m-kurtchg", (d) => ivPut(d, 25) + ivCall(d, 25) - 2 * atmIv(d), f2, "25Δ kurtosis change");
    const picked = flyChoice();
    const flySeries = (fn) => picked.map((x, i) => ({ name: flyName(x), color: FLY_PAL[i % FLY_PAL.length], fn: (d) => fn(d, x) }));
    levelChart("ch-m-fly", "lg-m-fly", flySeries(flyIv), f4, "Fly IV");
    levelChart("ch-m-fpx", "lg-m-fpx", flySeries(flyPx), f2, "Fly premium");
  }

  function syncFlyWidth() {
    ["s60-fly-width", "s60-chg-width"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = String(flyWidth);
    });
  }

  function renderAtm() {
    syncFlyWidth();
    const days = ensureMonth("s60-atm-month");
    paintDayTable(document.getElementById("s60-atm-tbl"), days, atmRows());
    const cats = days.map((d) => d.d);
    const every = Math.max(1, Math.ceil(days.length / 8));
    const xfmt = (d) => d.slice(8);
    const picked = atmChoice();
    const series = (read) => picked.map((off, i) => ({
      name: offsetName(off),
      color: FLY_PAL[i % FLY_PAL.length],
      fn: (d) => read(d, off)
    }));
    const showCurve = (el, lg, items) => {
      if (lg) legend(lg, items.map((s) => ({ name: s.name, color: s.color })));
      if (!items.length) {
        el.classList.add("fx-fail");
        el.replaceChildren();
        el.textContent = "Turn on at least one curve.";
        return false;
      }
      el.classList.remove("fx-fail");
      return true;
    };
    const levelChart = (id, lg, items, yfmt, yTitle) => {
      const el = document.getElementById(id);
      if (!showCurve(el, lg, items)) return;
      chart(el, {
        series: items.map((s) => ({ name: s.name, color: s.color, pts: days.map((d) => ({ x: d.d, y: s.fn(d) })) })),
        cats, every, xfmt, yfmt, yTitle
      });
    };
    const changeChart = (id, lg, items, yfmt, yTitle) => {
      const el = document.getElementById(id);
      if (!showCurve(el, lg, items)) return;
      chart(el, {
        series: items.map((s) => ({
          name: s.name, color: s.color,
          pts: days.map((d) => {
            const prev = sessionBefore(d.d);
            return { x: d.d, y: prev ? s.fn(d) - s.fn(prev) : null };
          })
        })),
        cats, every, xfmt, yfmt: (v) => signed(v, yfmt), zero: true, yTitle
      });
    };
    const visible = picked.filter((off) => !atmCurveOff.has(off));
    const on = (off) => visible.indexOf(off) >= 0;
    const dist = STRIKE_DIST.filter((k) => picked.indexOf(k) >= 0 || picked.indexOf(-k) >= 0);
    levelChart("ch-a-spot", "lg-a-spot", [{ name: "Spot", color: PAL[0], fn: (d) => d.u }], f1, "Spot");
    changeChart("ch-a-spotchg", "lg-a-spotchg", [{ name: "Spot", color: PAL[0], fn: (d) => d.u }], f1, "Spot change");
    levelChart("ch-a-vol", "lg-a-vol", [{ name: "ATM vol", color: PAL[1], fn: strikeAtmVol }], f2, "ATM vol (%)");
    changeChart("ch-a-volchg", "lg-a-volchg", [{ name: "ATM vol", color: PAL[1], fn: strikeAtmVol }], f2, "ATM vol change");
    const skew = [];
    dist.forEach((k) => {
      if (on(-k) && on(k)) skew.push({ name: "ATM ±" + k + " risk reversal", fn: (d) => strikeRr(d, k) });
      if (on(-k)) skew.push({ name: offsetName(-k) + " skew", fn: (d) => strikePutSkew(d, k) });
      if (on(k)) skew.push({ name: offsetName(k) + " skew", fn: (d) => strikeCallSkew(d, k) });
    });
    skew.forEach((s, i) => { s.color = FLY_PAL[i % FLY_PAL.length]; });
    const kurt = dist.filter((k) => on(-k) && on(k)).map((k, i) => ({
      name: "ATM ±" + k + " kurtosis",
      color: FLY_PAL[i % FLY_PAL.length],
      fn: (d) => strikeKurt(d, k)
    }));
    levelChart("ch-a-skew", "lg-a-skew", skew, f2, "Skew (vol pts)");
    changeChart("ch-a-skewchg", "lg-a-skewchg", skew, f2, "Skew change");
    levelChart("ch-a-kurt", "lg-a-kurt", kurt, f2, "Kurtosis (vol pts)");
    changeChart("ch-a-kurtchg", "lg-a-kurtchg", kurt, f2, "Kurtosis change");
    const iv = series(siv).filter((s) => visible.some((off) => offsetName(off) === s.name));
    const px = series(prem).filter((s) => visible.some((off) => offsetName(off) === s.name));
    const flyOff = visible.filter((off) => strikeFlyIv(days[0], off) != null);
    const fiv = series((d, off) => strikeFlyIv(d, off)).filter((s) => flyOff.some((off) => offsetName(off) === s.name));
    const fpx = series((d, off) => strikeFlyPx(d, off)).filter((s) => flyOff.some((off) => offsetName(off) === s.name));
    levelChart("ch-a-iv", "lg-a-iv", iv, f2, "Implied vol (%)");
    changeChart("ch-a-ivchg", "lg-a-ivchg", iv, f2, "IV change");
    levelChart("ch-a-px", "lg-a-px", px, f2, "Premium");
    changeChart("ch-a-pxchg", "lg-a-pxchg", px, f2, "Premium change");
    levelChart("ch-a-fiv", "lg-a-fiv", fiv, f4, "Fly IV");
    changeChart("ch-a-fivchg", "lg-a-fivchg", fiv, f4, "Fly IV change");
    levelChart("ch-a-fpx", "lg-a-fpx", fpx, f2, "Fly premium");
    changeChart("ch-a-fpxchg", "lg-a-fpxchg", fpx, f2, "Fly premium change");
    paintToggles(document.getElementById("s60-atm-toggles"), picked.map((off, i) => ({
      key: off,
      name: offsetName(off),
      color: FLY_PAL[i % FLY_PAL.length]
    })), atmCurveOff);
  }

  function monthKeys() {
    const keys = [];
    DATES.forEach((d) => {
      const key = d.slice(0, 7);
      if (keys[keys.length - 1] !== key) keys.push(key);
    });
    return keys;
  }

  function shiftMonth(step) {
    const keys = monthKeys();
    if (!monthKey) monthKey = sorted()[sorted().length - 1].slice(0, 7);
    const i = keys.indexOf(monthKey);
    if (i < 0) return;
    const j = i + step;
    if (j < 0 || j >= keys.length) return;
    monthKey = keys[j];
    render();
  }

  function syncMonthButtons() {
    const keys = monthKeys();
    const i = keys.indexOf(monthKey);
    [["s60-month-prev", "s60-chg-prev"], ["s60-month-next", "s60-chg-next"]].forEach((pair, side) => {
      const atEnd = side === 0 ? i <= 0 : i < 0 || i >= keys.length - 1;
      pair.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.disabled = atEnd;
      });
    });
  }

  function paintToggles(host, items, hidden) {
    host.replaceChildren();
    const button = (text, fill) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "fx-reset";
      el.textContent = text;
      el.addEventListener("click", () => { fill(); render(); });
      return el;
    };
    host.append(
      button("All on", () => items.forEach((it) => hidden.delete(it.key))),
      button("All off", () => items.forEach((it) => hidden.add(it.key)))
    );
    items.forEach((it) => {
      const label = document.createElement("label");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = !hidden.has(it.key);
      box.addEventListener("change", () => {
        if (box.checked) hidden.delete(it.key);
        else hidden.add(it.key);
        render();
      });
      label.appendChild(box);
      if (it.color) {
        const sw = document.createElement("i");
        sw.style.background = it.color;
        label.appendChild(sw);
      }
      label.appendChild(document.createTextNode(it.name));
      host.appendChild(label);
    });
  }

  function sessionTitle(day) {
    const dt = new Date(day.d + "T12:00:00");
    const wd = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dt.getDay()];
    return wd + " " + Number(day.d.slice(8)) + " " + MONTH_NAMES[Number(day.d.slice(5, 7)) - 1];
  }

  function changeDistances() {
    const mode = document.getElementById("s60-chg-dist").value;
    if (mode === "near") return STRIKE_DIST.filter((k) => k <= 200);
    if (mode === "mid") return STRIKE_DIST.filter((k) => k <= 400);
    return STRIKE_DIST.slice();
  }

  function dayBars(el, items, yfmt) {
    el.replaceChildren();
    el.classList.remove("fx-fail");
    const rows = items.filter((it) => it.y != null);
    const W = Math.max(480, el.clientWidth || 720);
    const rowH = 22;
    const H = Math.max(rowH + 8, rows.length * rowH + 8);
    const svg = d3.select(el).append("svg").attr("width", "100%").attr("viewBox", `0 0 ${W} ${H}`);
    const vals = rows.map((it) => it.y);
    let [y0, y1] = d3.extent(vals);
    y0 = Math.min(y0, 0);
    y1 = Math.max(y1, 0);
    if (!(y1 > y0)) { y0 -= 1; y1 += 1; }
    const pad = (y1 - y0) * 0.06;
    const labelW = 118;
    const x = d3.scaleLinear([y0 - pad, y1 + pad], [labelW, W - 78]).nice();
    const g = svg.append("g");
    g.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", 2).attr("y2", H - 4)
      .attr("stroke", "var(--cds-chart-reference)").attr("stroke-dasharray", "3 3");
    rows.forEach((it, i) => {
      const y = i * rowH + 2;
      g.append("text").attr("x", labelW - 8).attr("y", y + 15).attr("text-anchor", "end")
        .attr("font-size", 12).attr("fill", "var(--color-fg)").text(it.x);
      const x0 = x(0);
      const x1 = x(it.y);
      g.append("rect")
        .attr("x", Math.min(x0, x1)).attr("y", y + 5)
        .attr("width", Math.max(1, Math.abs(x1 - x0))).attr("height", 12)
        .attr("fill", it.y >= 0 ? UP : DN);
      g.append("text").attr("x", W - 8).attr("y", y + 15).attr("text-anchor", "end")
        .attr("font-size", 12).attr("fill", it.y >= 0 ? UP : DN).text(signed(it.y, yfmt));
    });
  }

  function paintDayChanges(days) {
    const host = document.getElementById("s60-c-days");
    host.replaceChildren();
    const dist = changeDistances();
    days.forEach((day) => {
      const prev = sessionBefore(day.d);
      const sec = document.createElement("section");
      sec.className = "s60-day";
      const h = document.createElement("h3");
      h.textContent = sessionTitle(day);
      const sub = document.createElement("p");
      sub.className = "fx-note";
      sec.append(h, sub);
      host.appendChild(sec);
      if (!prev) {
        sub.textContent = "No previous session.";
        return;
      }
      sub.textContent = "Change from " + sessionTitle(prev) + ".";
      const grid = document.createElement("div");
      grid.className = "s60-day-grid";
      sec.appendChild(grid);
      const column = (title, wide) => {
        const col = document.createElement("div");
        if (wide) col.className = "s60-wide";
        const h4 = document.createElement("h4");
        h4.textContent = title;
        const el = document.createElement("div");
        el.className = "s60-chart fx-chart s60-short";
        col.append(h4, el);
        grid.appendChild(col);
        return el;
      };
      const diff = (fn) => fn(day) - fn(prev);
      const spotEl = chgOff.has("spot") ? null : column("Spot");
      const rows = [];
      if (!chgOff.has("vol")) rows.push({ x: "ATM vol", y: diff(strikeAtmVol) });
      if (!chgOff.has("skew")) {
        dist.forEach((k) => {
          rows.push({ x: "±" + k + " RR", y: diff((d) => strikeRr(d, k)) });
          rows.push({ x: "−" + k + " skew", y: diff((d) => strikePutSkew(d, k)) });
          rows.push({ x: "+" + k + " skew", y: diff((d) => strikeCallSkew(d, k)) });
        });
      }
      if (!chgOff.has("kurt")) {
        dist.forEach((k) => {
          rows.push({ x: "±" + k + " K", y: diff((d) => strikeKurt(d, k)) });
        });
      }
      const mixEl = rows.length ? column("ATM vol, skew, kurtosis", true) : null;
      if (spotEl) dayBars(spotEl, [{ x: "Spot", y: day.u - prev.u }], f1);
      if (mixEl) dayBars(mixEl, rows, f2);
    });
  }

  function hist(el, days, fn, yfmt, yTitle) {
    chart(el, {
      h: 240,
      series: [{
        name: "Change", color: UP, bars: true,
        pts: days.map((d) => {
          const prev = sessionBefore(d.d);
          if (!prev) return { x: d.d, y: null };
          return barPt(d.d, fn(d) - fn(prev));
        })
      }],
      cats: days.map((d) => d.d),
      every: Math.max(1, Math.ceil(days.length / 8)),
      xfmt: (d) => d.slice(8),
      yfmt: (v) => signed(v, yfmt),
      zero: true,
      yTitle
    });
  }

  function histGrid(host, days, items, yfmt, yTitle) {
    host.replaceChildren();
    items.forEach((item) => {
      const block = document.createElement("div");
      const title = document.createElement("h3");
      title.textContent = item.name;
      const el = document.createElement("div");
      el.className = "s60-chart fx-chart s60-short";
      block.append(title, el);
      host.appendChild(block);
      hist(el, days, item.fn, yfmt, yTitle);
    });
  }

  function renderChanges() {
    syncFlyWidth();
    const days = ensureMonth("s60-chg-month");
    syncMonthButtons();
    const deltaMode = document.getElementById("s60-chg-fly").value;
    const deltas = deltaMode === "all" ? FLY_X.slice() : [10, 25, 50, 75, 90];
    const offMode = document.getElementById("s60-chg-off").value;
    const flyOffs = offMode === "all" ? SX.filter((off) => strikeFlyIv(DAYS[0], off) != null) : [-200, -100, 0, 100, 200];
    const grid = (host, items, fmt, title) => {
      const shown = items.filter((it) => !chgOff.has(it.key));
      host.parentElement.hidden = items.length > 0 && shown.length === 0;
      if (shown.length) histGrid(host, days, shown, fmt, title);
      else host.replaceChildren();
    };
    paintDayChanges(days);
    const flyItems = deltas.map((x) => ({ key: "df:" + x, name: flyName(x) + " fly premium", fn: (d) => flyPx(d, x) }));
    const fivItems = flyOffs.map((off) => ({ key: "fiv:" + off, name: offsetName(off) + " fly IV", fn: (d) => strikeFlyIv(d, off) }));
    const fpxItems = flyOffs.map((off) => ({ key: "fpx:" + off, name: offsetName(off) + " fly premium", fn: (d) => strikeFlyPx(d, off) }));
    grid(document.getElementById("s60-c-fly"), flyItems, f2, "Fly premium change");
    grid(document.getElementById("s60-c-fiv"), fivItems, f4, "Fly IV change");
    grid(document.getElementById("s60-c-fpx"), fpxItems, f2, "Fly premium change");
    paintToggles(document.getElementById("s60-chg-toggles"), [
      { key: "spot", name: "Spot" },
      { key: "vol", name: "ATM vol" },
      { key: "skew", name: "Skew" },
      { key: "kurt", name: "Kurtosis" },
      ...flyItems, ...fivItems, ...fpxItems
    ], chgOff);
  }

  function activePanel() {
    return document.querySelector(".s60-panel.on").id;
  }

  function render() {
    selected = sorted();
    renderPicker();
    const days = selected.map((d) => BY.get(d));
    const first = days[0];
    const last = days[days.length - 1];
    const take = document.getElementById("s60-take");
    if (days.length === 1) {
      take.textContent = first.d + " · spot " + f1(first.u) + " · ATM IV " + f2(atmIv(first)) + "%";
    } else {
      const spot = last.u - first.u;
      take.textContent = first.d + " → " + last.d + " · " + days.length + " sessions · spot " + signed(spot, f1)
        + " · ATM IV " + f2(atmIv(last)) + "% (" + signed(atmIv(last) - atmIv(first), f2) + " vol)";
    }
    const panel = activePanel();
    if (panel === "p-daily") renderDaily(days);
    if (panel === "p-hist") renderHist();
    if (panel === "p-regime") renderRegime();
    if (panel === "p-delta") renderDelta(days);
    if (panel === "p-struct") renderStruct(days);
    if (panel === "p-ts") renderTs(days);
    if (panel === "p-fly") renderFly(days);
    if (panel === "p-fix") renderFix(days);
    if (panel === "p-spr") renderSpr(days);
    if (panel === "p-prem") { renderPrem("delta"); renderPrem("strike"); }
    if (panel === "p-month") renderMonth();
    if (panel === "p-atm") renderAtm();
    if (panel === "p-chg") renderChanges();
  }

  function showPanel(id) {
    document.querySelectorAll(".s60-tabs button").forEach((b) => {
      b.setAttribute("aria-selected", b.dataset.panel === id ? "true" : "false");
    });
    document.querySelectorAll(".s60-panel").forEach((p) => p.classList.toggle("on", p.id === id));
    const pages = {
      "p-month": { link: "nav-month", hash: "#month", title: "Monthly review", doc: "SPX monthly review" },
      "p-atm": { link: "nav-atm", hash: "#atm", title: "ATM offsets", doc: "SPX ATM offsets" },
      "p-chg": { link: "nav-changes", hash: "#changes", title: "Daily changes", doc: "SPX daily changes" }
    };
    ["nav-month", "nav-atm", "nav-changes", "nav-smile"].forEach((nid) => document.getElementById(nid).removeAttribute("aria-current"));
    const spec = pages[id];
    if (spec) {
      document.getElementById(spec.link).setAttribute("aria-current", "page");
      document.querySelector(".fx-brand h1").textContent = spec.title;
      document.title = spec.doc;
      if (location.hash !== spec.hash) history.replaceState(null, "", spec.hash);
    } else {
      document.getElementById("nav-smile").setAttribute("aria-current", "page");
      document.querySelector(".fx-brand h1").textContent = "60-DTE smile";
      document.title = "SPX 60-DTE Smile Analysis";
      if (location.hash === "#month" || location.hash === "#atm" || location.hash === "#changes") {
        history.replaceState(null, "", location.pathname + location.search);
      }
    }
    render();
  }

  document.querySelectorAll(".s60-tabs button").forEach((btn) => {
    if (btn.dataset.panel === "p-atm") {
      btn.addEventListener("click", () => showPanel("p-atm"));
      return;
    }
    btn.disabled = true;
    btn.setAttribute("aria-disabled", "true");
  });
  document.getElementById("nav-atm").addEventListener("click", (ev) => {
    ev.preventDefault();
    showPanel("p-atm");
  });
  document.addEventListener("click", (ev) => {
    const link = ev.target.closest("a");
    if (!link) return;
    ev.preventDefault();
    ev.stopPropagation();
  }, true);

  document.getElementById("s60-prev").addEventListener("click", () => {
    const idx = selected.map((d) => DATES.indexOf(d));
    if (idx.some((i) => i <= 0)) return;
    selected = idx.map((i) => DATES[i - 1]);
    followWindow();
    render();
  });
  document.getElementById("s60-next").addEventListener("click", () => {
    const idx = selected.map((d) => DATES.indexOf(d));
    if (idx.some((i) => i >= DATES.length - 1)) return;
    selected = idx.map((i) => DATES[i + 1]);
    followWindow();
    render();
  });
  document.getElementById("s60-add").addEventListener("click", () => {
    const last = Math.max(...selected.map((d) => DATES.indexOf(d)));
    if (last < DATES.length - 1) selected = selected.concat(DATES[last + 1]);
    followWindow();
    render();
  });
  document.getElementById("s60-filter").addEventListener("input", (ev) => {
    filter = ev.target.value;
    renderPicker();
  });
  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      view = btn.dataset.view;
      document.querySelectorAll("[data-view]").forEach((b) => b.setAttribute("aria-pressed", b === btn ? "true" : "false"));
      render();
    });
  });
  document.getElementById("s60-cat").addEventListener("change", () => { syncMetrics(); render(); });
  document.getElementById("s60-reg-date").addEventListener("change", (ev) => { regimeDate = ev.target.value; render(); });
  document.getElementById("s60-month").addEventListener("change", (ev) => { monthKey = ev.target.value; render(); });
  document.getElementById("s60-atm-month").addEventListener("change", (ev) => { monthKey = ev.target.value; render(); });
  document.getElementById("s60-atm-span").addEventListener("change", render);
  document.getElementById("s60-chg-month").addEventListener("change", (ev) => { monthKey = ev.target.value; render(); });
  document.getElementById("s60-chg-dist").addEventListener("change", render);
  document.getElementById("s60-chg-fly").addEventListener("change", render);
  document.getElementById("s60-chg-off").addEventListener("change", render);
  const setFlyWidth = (ev) => { flyWidth = Number(ev.target.value); render(); };
  document.getElementById("s60-fly-width").addEventListener("change", setFlyWidth);
  const atmTable = document.getElementById("s60-atm-table-wrap");
  const atmFull = document.getElementById("s60-atm-full");
  function syncAtmFull() {
    const on = document.fullscreenElement === atmTable;
    atmFull.textContent = on ? "Exit full screen" : "Full screen";
    atmFull.setAttribute("aria-pressed", on ? "true" : "false");
  }
  atmFull.addEventListener("click", () => {
    const done = document.fullscreenElement === atmTable ? document.exitFullscreen() : atmTable.requestFullscreen();
    if (done && done.catch) done.catch(() => {});
  });
  document.addEventListener("fullscreenchange", syncAtmFull);
  document.getElementById("s60-chg-width").addEventListener("change", setFlyWidth);
  document.getElementById("s60-chg-prev").addEventListener("click", () => shiftMonth(-1));
  document.getElementById("s60-chg-next").addEventListener("click", () => shiftMonth(1));
  document.getElementById("s60-month-prev").addEventListener("click", () => shiftMonth(-1));
  document.getElementById("s60-month-next").addEventListener("click", () => shiftMonth(1));
  document.getElementById("s60-month-fly").addEventListener("change", render);
  function hookFlyNav(kind) {
    const st = flyNav[kind];
    const p = kind === "delta"
      ? ["s60-fd-date", "s60-fd-prev", "s60-fd-next", "s60-fc-a", "s60-fc-b", "s60-fc-prev", "s60-fc-next"]
      : ["s60-xd-date", "s60-xd-prev", "s60-xd-next", "s60-xc-a", "s60-xc-b", "s60-xc-prev", "s60-xc-next"];
    document.getElementById(p[1]).addEventListener("click", () => { st.day = stepDate(st.day, -1); render(); });
    document.getElementById(p[2]).addEventListener("click", () => { st.day = stepDate(st.day, 1); render(); });
    document.getElementById(p[0]).addEventListener("change", (ev) => { st.day = ev.target.value; render(); });
    document.getElementById(p[3]).addEventListener("change", (ev) => { st.a = ev.target.value; render(); });
    document.getElementById(p[4]).addEventListener("change", (ev) => { st.b = ev.target.value; render(); });
    document.getElementById(p[5]).addEventListener("click", () => {
      if (DATES.indexOf(st.a) <= 0 || DATES.indexOf(st.b) <= 0) return;
      st.a = stepDate(st.a, -1);
      st.b = stepDate(st.b, -1);
      render();
    });
    document.getElementById(p[6]).addEventListener("click", () => {
      if (DATES.indexOf(st.a) >= DATES.length - 1 || DATES.indexOf(st.b) >= DATES.length - 1) return;
      st.a = stepDate(st.a, 1);
      st.b = stepDate(st.b, 1);
      render();
    });
  }
  hookFlyNav("delta");
  hookFlyNav("fix");

  function hookPremNav(kind) {
    const st = premNav[kind];
    const p = kind === "delta"
      ? ["s60-pd-date", "s60-pd-prev", "s60-pd-next", "s60-pc-a", "s60-pc-b", "s60-pc-prev", "s60-pc-next"]
      : ["s60-sd-date", "s60-sd-prev", "s60-sd-next", "s60-sc-a", "s60-sc-b", "s60-sc-prev", "s60-sc-next"];
    document.getElementById(p[1]).addEventListener("click", () => { st.day = stepDate(st.day, -1); render(); });
    document.getElementById(p[2]).addEventListener("click", () => { st.day = stepDate(st.day, 1); render(); });
    document.getElementById(p[0]).addEventListener("change", (ev) => { st.day = ev.target.value; render(); });
    document.getElementById(p[3]).addEventListener("change", (ev) => { st.a = ev.target.value; render(); });
    document.getElementById(p[4]).addEventListener("change", (ev) => { st.b = ev.target.value; render(); });
    document.getElementById(p[5]).addEventListener("click", () => {
      if (DATES.indexOf(st.a) <= 0 || DATES.indexOf(st.b) <= 0) return;
      st.a = stepDate(st.a, -1);
      st.b = stepDate(st.b, -1);
      render();
    });
    document.getElementById(p[6]).addEventListener("click", () => {
      if (DATES.indexOf(st.a) >= DATES.length - 1 || DATES.indexOf(st.b) >= DATES.length - 1) return;
      st.a = stepDate(st.a, 1);
      st.b = stepDate(st.b, 1);
      render();
    });
  }
  hookPremNav("delta");
  hookPremNav("strike");

  document.getElementById("s60-reg-prev").addEventListener("click", () => {
    const i = DATES.indexOf(regimeDate);
    if (i > 0) { regimeDate = DATES[i - 1]; render(); }
  });
  document.getElementById("s60-reg-next").addEventListener("click", () => {
    const i = DATES.indexOf(regimeDate);
    if (i < DATES.length - 1) { regimeDate = DATES[i + 1]; render(); }
  });
  ["s60-hist-delta", "s60-d1", "s60-d2", "s60-metric", "s60-fly-side", "s60-fix-side", "s60-spr-wing"].forEach((id) => {
    document.getElementById(id).addEventListener("change", render);
  });

  fillSelect("s60-hist-delta", DELTA_LEVELS.map((n) => [String(n), n + "Δ"]), "25");
  fillSelect("s60-d1", DELTA_LEVELS.map((n) => [String(n), n + "Δ"]), "5");
  fillSelect("s60-d2", DELTA_LEVELS.map((n) => [String(n), n + "Δ"]), "10");
  fillSelect("s60-cat", ["Market & core", "Skew", "Risk reversals", "Butterflies", "Put spreads", "Call spreads"].map((c) => [c, c]), "Market & core");
  syncMetrics();

  if (location.hash === "#month") showPanel("p-month");
  else if (location.hash === "#atm") showPanel("p-atm");
  else if (location.hash === "#changes") showPanel("p-chg");
  else render();
  let timer;
  window.addEventListener("resize", () => { clearTimeout(timer); timer = setTimeout(render, 120); });
})();
