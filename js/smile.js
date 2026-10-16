/* SPX 60-DTE smile lab driven by the SNP ladder (every trading day). */
(function () {
  const RAW = window.SMILE60;
  const DAYS = RAW.days;
  const DATES = DAYS.map((d) => d.d);
  const BY = new Map(DAYS.map((d) => [d.d, d]));
  const DX = RAW.deltaX;
  const SX = RAW.strikeX;
  const PAL = ["#636EFA", "#EF553B", "#00CC96", "#AB63FA", "#FFA15A", "#19D3F3", "#FF6692", "#B6E880"];
  const DELTA_LEVELS = [5, 10, 15, 20, 25, 30, 35, 40, 45];

  const wanted = ["2026-09-25", "2026-09-28"].filter((d) => BY.has(d));
  let selected = (wanted.length ? wanted : DATES.slice(-2)).slice();
  let view = "delta";
  let filter = "";

  const f1 = (v) => d3.format(",.2f")(v);
  const f2 = (v) => d3.format(".2f")(v);
  const f3 = (v) => d3.format(".3f")(v);
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

  function sorted() { return selected.slice().sort(); }

  function color(i) { return PAL[i % PAL.length]; }

  function chart(el, cfg) {
    el.replaceChildren();
    if (!cfg.series.length || !cfg.series[0].pts.length) {
      el.textContent = "Select at least one date.";
      return;
    }
    const W = Math.max(320, el.clientWidth || 640);
    const H = 320;
    const svg = d3.select(el).append("svg").attr("width", "100%").attr("viewBox", `0 0 ${W} ${H}`);
    const allY = cfg.series.flatMap((s) => s.pts.map((p) => p.y)).filter((v) => v != null && isFinite(v));
    let [y0, y1] = d3.extent(allY);
    if (cfg.zero) { y0 = Math.min(y0, 0); y1 = Math.max(y1, 0); }
    if (!(y1 > y0)) { y0 -= 1; y1 += 1; }
    const pad = (y1 - y0) * 0.08;
    const y = d3.scaleLinear([y0 - pad, y1 + pad], [H - 36, 16]).nice();
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
    g.selectAll("line").data(y.ticks(6)).join("line")
      .attr("x1", L).attr("x2", W - R).attr("y1", (d) => y(d)).attr("y2", (d) => y(d)).attr("stroke", "#eee");
    g.selectAll("text.ty").data(y.ticks(6)).join("text")
      .attr("x", L - 8).attr("y", (d) => y(d)).attr("dy", "0.32em").attr("text-anchor", "end")
      .attr("font-size", 12).attr("fill", "#666").text(cfg.yfmt);
    const xt = cfg.xticks || (cats ? cats.filter((_, i) => i % (cfg.every || 1) === 0) : x.ticks(7));
    g.selectAll("text.tx").data(xt).join("text")
      .attr("x", (d) => x(d)).attr("y", H - 16).attr("text-anchor", "middle")
      .attr("font-size", 11).attr("fill", "#666").text((d) => cfg.xfmt ? cfg.xfmt(d) : d);
    if (cfg.zero) g.append("line").attr("x1", L).attr("x2", W - R).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", "#ccc");
    cfg.series.forEach((s) => {
      const pts = s.pts.filter((p) => p.y != null && isFinite(p.y));
      if (!pts.length) return;
      if (s.bars) {
        const bw = cats
          ? Math.max(4, x.step() * 0.55)
          : Math.max(3, Math.abs(x(pts[Math.min(1, pts.length - 1)].x) - x(pts[0].x)) * 0.55);
        g.append("g").selectAll("rect").data(pts).join("rect")
          .attr("x", (p) => x(p.x) - bw / 2).attr("width", bw)
          .attr("y", (p) => Math.min(y(p.y), y(0)))
          .attr("height", (p) => Math.abs(y(p.y) - y(0)))
          .attr("fill", s.color);
      } else {
        g.append("path")
          .attr("d", d3.line().defined((p) => p.y != null).x((p) => x(p.x)).y((p) => y(p.y))(pts))
          .attr("fill", "none").attr("stroke", s.color).attr("stroke-width", 2);
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
    svg.append("rect").attr("x", L).attr("y", 0).attr("width", Math.max(0, W - L - R)).attr("height", H - 30).attr("fill", "transparent")
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
          line.textContent = s.name + ": " + cfg.yfmt(p.y);
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
      i.style.background = it.color;
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
  function sideKeep(x, side, atm) {
    if (side === "put") return x < 0 || (atm && x === atm);
    if (side === "call") return x > 0 || (atm && x === atm);
    return true;
  }

  function kpi(label, value, sub, up) {
    const d = document.createElement("div");
    d.className = "s60-kpi";
    d.innerHTML = `<div class="lbl"></div><div class="val"></div>`;
    d.querySelector(".lbl").textContent = label;
    d.querySelector(".val").textContent = value;
    if (sub) {
      const s = document.createElement("div");
      s.className = "sub" + (up ? " up" : "");
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
      chip.className = "s60-chip";
      chip.append(document.createTextNode(d + " "));
      const x = document.createElement("button");
      x.type = "button";
      x.textContent = "×";
      x.setAttribute("aria-label", "Remove " + d);
      x.addEventListener("click", () => {
        if (selected.length === 1) return;
        selected = selected.filter((k) => k !== d);
        render();
      });
      chip.appendChild(x);
      chips.appendChild(chip);
    });
    const list = document.getElementById("s60-list");
    list.replaceChildren();
    const q = filter.trim();
    DATES.filter((d) => !q || d.includes(q)).slice().reverse().forEach((d) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = d;
      if (selected.includes(d)) b.className = "on";
      b.addEventListener("click", () => {
        if (selected.includes(d)) {
          if (selected.length === 1) return;
          selected = selected.filter((k) => k !== d);
        } else selected = selected.concat(d);
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
        series: [{ name: "Change", color: PAL[0], bars: true, pts: a.map((p, i) => ({ x: p.x, y: b[i].y - p.y })) }],
        ...ax, yfmt: (v) => signed(v, f2), zero: true, yTitle: "Δ IV (vol pts)"
      });
    }
    const table = document.getElementById("s60-metrics");
    const th = table.querySelector("thead");
    const tb = table.querySelector("tbody");
    th.replaceChildren();
    tb.replaceChildren();
    const hr = document.createElement("tr");
    [view === "strike" ? "Strike" : "Delta", ...days.map((d) => d.d), days.length > 1 ? "Δ" : ""].filter(Boolean).forEach((t) => {
      const h = document.createElement("th");
      h.textContent = t;
      hr.appendChild(h);
    });
    th.appendChild(hr);
    smilePts(days[0]).forEach((p, i) => {
      const tr = document.createElement("tr");
      const cells = [ax.xfmt(p.x), ...days.map((day) => f2(smilePts(day)[i].y))];
      if (days.length > 1) {
        const dlt = smilePts(last)[i].y - smilePts(first)[i].y;
        cells.push(signed(dlt, f2));
      }
      cells.forEach((t, j) => {
        const td = document.createElement("td");
        td.textContent = t;
        if (j === cells.length - 1 && days.length > 1) {
          const n = smilePts(last)[i].y - smilePts(first)[i].y;
          td.className = n > 0 ? "up" : n < 0 ? "dn" : "";
        }
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
    document.getElementById("s60-move-title").textContent = days.length > 1
      ? `Smile Movement Analysis (${first.d} to ${last.d})`
      : "Smile Movement Analysis";
    const move = document.getElementById("s60-move");
    if (days.length < 2 || view !== "delta") {
      move.textContent = days.length < 2 ? "Add another date to compare the wings." : "Switch View By to Delta to read the put and call wings.";
      return;
    }
    const dPut = ivPut(last, 5) - ivPut(first, 5);
    const dCall = ivCall(last, 5) - ivCall(first, 5);
    const dAtm = atmIv(last) - atmIv(first);
    let line = `ATM IV ${signed(dAtm, f2)} vol. 5Δ put ${signed(dPut, f2)} vol, 5Δ call ${signed(dCall, f2)} vol.`;
    if (dCall < -0.02 && dPut > 0.05) line = "Call wing flattening. " + line;
    else if (dPut > 0.2 && dCall > 0.2) line = "Both wings higher. " + line;
    else if (dPut < -0.05 && dCall > 0.02) line = "Put wing compressing. " + line;
    move.textContent = line;
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
      cats: DATES, every, xfmt: (d) => d.slice(0, 7), yfmt: f2, yTitle: "Implied Volatility (%)"
    });
    chart(document.getElementById("ch-rr"), {
      series: [{ name: level + "Δ RR", color: PAL[0], pts: DAYS.map((d) => ({ x: d.d, y: ivPut(d, level) - ivCall(d, level) })) }],
      cats: DATES, every, xfmt: (d) => d.slice(0, 7), yfmt: f2, yTitle: "Risk Reversal (vol pts)"
    });
  }

  function renderRegime(days) {
    const day = days[days.length - 1];
    const atms = DAYS.map(atmIv).sort((a, b) => a - b);
    const v = atmIv(day);
    const pct = atms.filter((a) => a <= v).length / atms.length * 100;
    const name = pct <= 20 ? "LOW VOL" : pct >= 80 ? "HIGH VOL" : "MID VOL";
    const box = document.getElementById("s60-regime");
    box.replaceChildren();
    box.append(
      kpi("Date", day.d),
      kpi("Spot", f1(day.u)),
      kpi("ATM IV", f2(v) + "%"),
      kpi("ATM IV percentile", f1(pct) + "%"),
      kpi("Regime", name)
    );
  }

  function renderDelta() {
    const a = Number(document.getElementById("s60-d1").value);
    const b = Number(document.getElementById("s60-d2").value);
    document.getElementById("s60-delta-note").textContent = `${deltaName(a)} against ${deltaName(b)} across the full SNP history.`;
    const every = Math.ceil(DATES.length / 8);
    legend("lg-delta", [{ name: deltaName(a), color: PAL[0] }, { name: deltaName(b), color: PAL[1] }]);
    chart(document.getElementById("ch-delta"), {
      series: [
        { name: deltaName(a), color: PAL[0], pts: DAYS.map((d) => ({ x: d.d, y: d.iv[DX.indexOf(a)] })) },
        { name: deltaName(b), color: PAL[1], pts: DAYS.map((d) => ({ x: d.d, y: d.iv[DX.indexOf(b)] })) }
      ],
      cats: DATES, every, xfmt: (d) => d.slice(0, 7), yfmt: f2, yTitle: "Implied Volatility (%)"
    });
  }

  function renderStruct(days) {
    const table = document.getElementById("s60-struct");
    const th = table.querySelector("thead");
    const tb = table.querySelector("tbody");
    th.replaceChildren();
    tb.replaceChildren();
    const hr = document.createElement("tr");
    ["Metric", ...days.map((d) => d.d), days.length > 1 ? "Δ" : ""].filter(Boolean).forEach((t) => {
      const h = document.createElement("th");
      h.textContent = t;
      hr.appendChild(h);
    });
    th.appendChild(hr);
    const rows = [
      ["Spot", (d) => d.u, f1],
      ["ATM IV", (d) => atmIv(d), f2],
      ["25Δ RR", (d) => ivPut(d, 25) - ivCall(d, 25), f2],
      ["10Δ RR", (d) => ivPut(d, 10) - ivCall(d, 10), f2],
      ["5Δ RR", (d) => ivPut(d, 5) - ivCall(d, 5), f2],
      ["25Δ fly", (d) => (ivPut(d, 20) + ivPut(d, 30)) / 2 - ivPut(d, 25), f3],
      ["ATM fly proxy", (d) => (siv(d, -700) + siv(d, 700)) / 2 - atmIv(d), f3]
    ];
    rows.forEach(([name, fn, fmt]) => {
      const tr = document.createElement("tr");
      const vals = days.map(fn);
      const cells = [name, ...vals.map(fmt)];
      if (days.length > 1) cells.push(signed(vals[vals.length - 1] - vals[0], fmt));
      cells.forEach((t) => {
        const td = document.createElement("td");
        td.textContent = t;
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
  }

  function seriesFor(metric) {
    if (metric === "spot") return { name: "Spot", y: (d) => d.u, fmt: (v) => d3.format(",.0f")(v) };
    if (metric === "atm") return { name: "ATM IV", y: atmIv, fmt: f2 };
    if (metric === "p25") return { name: "25Δ P", y: (d) => ivPut(d, 25), fmt: f2 };
    if (metric === "c25") return { name: "25Δ C", y: (d) => ivCall(d, 25), fmt: f2 };
    if (metric === "rr25") return { name: "25Δ RR", y: (d) => ivPut(d, 25) - ivCall(d, 25), fmt: f2 };
    return { name: "ATM fly proxy", y: (d) => (siv(d, -700) + siv(d, 700)) / 2 - atmIv(d), fmt: f3 };
  }

  function renderTs() {
    const spec = seriesFor(document.getElementById("s60-metric").value);
    document.getElementById("s60-ts-title").textContent = "Time Series: " + spec.name;
    chart(document.getElementById("ch-spot"), {
      series: [{ name: spec.name, color: PAL[0], pts: DAYS.map((d) => ({ x: d.d, y: spec.y(d) })) }],
      cats: DATES, every: Math.ceil(DATES.length / 8), xfmt: (d) => d.slice(0, 7), yfmt: spec.fmt, yTitle: spec.name
    });
  }

  function renderFly(days) {
    const side = document.getElementById("s60-fly-side").value;
    const first = days[0];
    const last = days[days.length - 1];
    const box = document.getElementById("s60-fly-kpis");
    box.replaceChildren();
    box.append(kpi("Spot " + last.d, f1(last.u), days.length > 1 ? signed(last.u - first.u, f1) + " (" + signed((last.u - first.u) / first.u * 100, f2) + "%)" : null, last.u > first.u));
    box.append(kpi("ATM IV " + last.d, f2(atmIv(last)), days.length > 1 ? signed(atmIv(last) - atmIv(first), f2) + " vol" : null, atmIv(last) > atmIv(first)));
    const keep = (p) => side === "put" ? p.x < 50 : side === "call" ? p.x > 50 : true;
    legend("lg-fly", days.map((d, i) => ({ name: d.d, color: color(i) })));
    const cats = flies(first).map((p) => p.x).filter((x) => keep({ x }));
    chart(document.getElementById("ch-fly"), {
      series: days.map((day, i) => ({ name: day.d, color: color(i), pts: flies(day).filter(keep) })),
      cats, every: 2, xfmt: flyName, yfmt: f3, yTitle: "IV Fly"
    });
    const title = document.getElementById("s60-flychg-title");
    const el = document.getElementById("ch-flychg");
    const notes = document.getElementById("s60-fly-notes");
    notes.replaceChildren();
    if (days.length < 2) {
      title.textContent = "Fly value change";
      el.replaceChildren();
      return;
    }
    title.textContent = `Fly Value Change: ${last.d} vs ${first.d}`;
    const a = flies(first).filter(keep);
    const b = flies(last).filter(keep);
    chart(el, {
      series: [{ name: "Change", color: PAL[0], bars: true, pts: a.map((p, i) => ({ x: p.x, y: b[i].y - p.y })) }],
      cats, every: 2, xfmt: flyName, yfmt: (v) => signed(v, f3), zero: true, yTitle: "Δ IV Fly"
    });
    const diffs = a.map((p, i) => ({ x: p.x, y: b[i].y - p.y }));
    const biggest = diffs.reduce((m, p) => Math.abs(p.y) > Math.abs(m.y) ? p : m, diffs[0]);
    const puts = diffs.filter((p) => p.x < 50);
    const calls = diffs.filter((p) => p.x > 50);
    const putMag = puts.reduce((s, p) => s + Math.abs(p.y), 0);
    const callMag = calls.reduce((s, p) => s + Math.abs(p.y), 0);
    const lines = [
      `${flyName(biggest.x)} fly changed ${signed(biggest.y, f3)}, the largest move on this side.`,
      putMag && callMag ? (putMag > callMag ? "Put-side fly curvature changed more than the call side." : "Call-side fly curvature changed more than the put side.") : ""
    ].filter(Boolean);
    lines.forEach((t) => {
      const p = document.createElement("p");
      p.className = "s60-note";
      p.textContent = t;
      notes.appendChild(p);
    });
  }

  function renderFix(days) {
    const side = document.getElementById("s60-fix-side").value;
    const first = days[0];
    const last = days[days.length - 1];
    const box = document.getElementById("s60-fix-kpis");
    box.replaceChildren();
    const rr = (d) => siv(d, -400) - siv(d, 400);
    const fly = (d) => (siv(d, -700) + siv(d, 700)) / 2 - atmIv(d);
    box.append(
      kpi("Spot change", f1(last.u), days.length > 1 ? signed(last.u - first.u, f1) : null, last.u > first.u),
      kpi("ATM IV", f2(atmIv(last)) + "%", days.length > 1 ? signed(atmIv(last) - atmIv(first), f2) + " vol" : null, atmIv(last) > atmIv(first)),
      kpi("RR ATM±400", f2(rr(last)) + " vol", days.length > 1 ? signed(rr(last) - rr(first), f2) + " pts" : null, rr(last) > rr(first)),
      kpi("ATM fly proxy", f2(fly(last)), days.length > 1 ? signed(fly(last) - fly(first), f3) + " pts" : null, fly(last) > fly(first))
    );
    const keep = (p) => side === "put" ? p.x < 0 : side === "call" ? p.x > 0 : p.x !== 0;
    const cats = fixedFlies(first).map((p) => p.x).filter((x) => keep({ x }));
    legend("lg-fix", days.map((d, i) => ({ name: d.d, color: color(i) })));
    chart(document.getElementById("ch-fix"), {
      series: days.map((day, i) => ({ name: day.d, color: color(i), pts: fixedFlies(day).filter(keep) })),
      cats, every: 2, xfmt: strikeName, yfmt: f3, yTitle: "IV Fly (vol pts)"
    });
    const title = document.getElementById("s60-fixchg-title");
    const el = document.getElementById("ch-fixchg");
    if (days.length < 2) {
      title.textContent = "Fly value change";
      el.replaceChildren();
      return;
    }
    title.textContent = `Fly Value Change: ${last.d} vs ${first.d}`;
    const a = fixedFlies(first).filter(keep);
    const b = fixedFlies(last).filter(keep);
    chart(el, {
      series: [{ name: "Δ Fly", color: PAL[0], bars: true, pts: a.map((p, i) => ({ x: p.x, y: b[i].y - p.y })) }],
      cats, every: 2, xfmt: strikeName, yfmt: (v) => signed(v, f3), zero: true, yTitle: "Change in IV Fly"
    });
  }

  function activePanel() {
    return document.querySelector(".s60-panel.on").id;
  }

  function render() {
    selected = sorted();
    renderPicker();
    const days = selected.map((d) => BY.get(d));
    const panel = activePanel();
    if (panel === "p-daily") renderDaily(days);
    if (panel === "p-hist") renderHist();
    if (panel === "p-regime") renderRegime(days);
    if (panel === "p-delta") renderDelta();
    if (panel === "p-struct") renderStruct(days);
    if (panel === "p-ts") renderTs();
    if (panel === "p-fly") renderFly(days);
    if (panel === "p-fix") renderFix(days);
  }

  document.querySelectorAll(".s60-tabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".s60-tabs button").forEach((b) => b.setAttribute("aria-selected", "false"));
      document.querySelectorAll(".s60-panel").forEach((p) => p.classList.remove("on"));
      btn.setAttribute("aria-selected", "true");
      document.getElementById(btn.dataset.panel).classList.add("on");
      render();
    });
  });

  document.getElementById("s60-prev").addEventListener("click", () => {
    const idx = selected.map((d) => DATES.indexOf(d));
    if (idx.some((i) => i <= 0)) return;
    selected = idx.map((i) => DATES[i - 1]);
    render();
  });
  document.getElementById("s60-next").addEventListener("click", () => {
    const idx = selected.map((d) => DATES.indexOf(d));
    if (idx.some((i) => i >= DATES.length - 1)) return;
    selected = idx.map((i) => DATES[i + 1]);
    render();
  });
  document.getElementById("s60-add").addEventListener("click", () => {
    const last = Math.max(...selected.map((d) => DATES.indexOf(d)));
    if (last < DATES.length - 1) selected = selected.concat(DATES[last + 1]);
    render();
  });
  document.getElementById("s60-filter").addEventListener("input", (ev) => {
    filter = ev.target.value;
    renderPicker();
  });
  document.getElementById("s60-view").addEventListener("change", (ev) => { view = ev.target.value; render(); });
  ["s60-hist-delta", "s60-d1", "s60-d2", "s60-metric", "s60-fly-side", "s60-fix-side"].forEach((id) => {
    document.getElementById(id).addEventListener("change", render);
  });

  fillSelect("s60-hist-delta", DELTA_LEVELS.map((n) => [String(n), n + "Δ"]), "25");
  fillSelect("s60-d1", DX.map((x) => [String(x), deltaName(x)]), "25");
  fillSelect("s60-d2", DX.map((x) => [String(x), deltaName(x)]), "75");
  fillSelect("s60-metric", [
    ["spot", "Spot"],
    ["atm", "ATM IV"],
    ["p25", "25Δ put IV"],
    ["c25", "25Δ call IV"],
    ["rr25", "25Δ risk reversal"],
    ["fly", "ATM fly proxy"]
  ], "spot");

  render();
  let timer;
  window.addEventListener("resize", () => { clearTimeout(timer); timer = setTimeout(render, 120); });
})();
