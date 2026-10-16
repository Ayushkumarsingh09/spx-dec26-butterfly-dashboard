/* SPX 60-DTE smile view, rebuilt from the Streamlit lab at the captured window. */
(function () {
  const D = window.SMILE60;
  const C1 = "#636EFA";
  const C2 = "#EF553B";

  document.querySelectorAll(".s60-tabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".s60-tabs button").forEach((b) => b.setAttribute("aria-selected", "false"));
      document.querySelectorAll(".s60-panel").forEach((p) => p.classList.remove("on"));
      btn.setAttribute("aria-selected", "true");
      document.getElementById(btn.dataset.panel).classList.add("on");
      drawAll();
    });
  });

  function deltaName(x) {
    if (x === 50) return "ATM";
    if (x < 50) return x + "Δ P";
    return (100 - x) + "Δ C";
  }

  function chart(el, cfg) {
    el.replaceChildren();
    const W = Math.max(320, el.clientWidth || 640);
    const H = 320;
    const svg = d3.select(el).append("svg").attr("width", "100%").attr("viewBox", `0 0 ${W} ${H}`);
    const allY = cfg.series.flatMap((s) => s.pts.map((p) => p.y));
    let [y0, y1] = d3.extent(allY);
    if (cfg.zero) { y0 = Math.min(y0, 0); y1 = Math.max(y1, 0); }
    if (y1 - y0 < 1e-9) { y0 -= 1; y1 += 1; }
    const pad = (y1 - y0) * 0.08;
    const y = d3.scaleLinear([y0 - pad, y1 + pad], [H - 36, 16]).nice();
    const ys = y.ticks(6).map(cfg.yfmt);
    const meas = svg.append("g").attr("font-size", 12);
    let lw = 0;
    ys.forEach((t) => {
      const n = meas.append("text").text(t);
      lw = Math.max(lw, n.node().getComputedTextLength());
      n.remove();
    });
    meas.remove();
    const L = Math.ceil(lw) + 12;
    const R = 16;
    const cats = cfg.cats;
    const x = cats
      ? d3.scalePoint(cats, [L, W - R])
      : d3.scaleLinear(cfg.xdom, [L, W - R]);
    const g = svg.append("g");
    g.selectAll("line.gy").data(y.ticks(6)).join("line")
      .attr("x1", L).attr("x2", W - R).attr("y1", (d) => y(d)).attr("y2", (d) => y(d))
      .attr("stroke", "#eee");
    g.selectAll("text.ty").data(y.ticks(6)).join("text")
      .attr("x", L - 8).attr("y", (d) => y(d)).attr("dy", "0.32em").attr("text-anchor", "end")
      .attr("font-size", 12).attr("fill", "#666").text(cfg.yfmt);
    const xt = cfg.xticks || (cats ? cats.filter((_, i) => i % cfg.every === 0) : x.ticks(cfg.xticksN || 7));
    g.selectAll("text.tx").data(xt).join("text")
      .attr("x", (d) => x(d)).attr("y", H - 14).attr("text-anchor", "middle")
      .attr("font-size", 11).attr("fill", "#666").text((d) => cfg.xfmt ? cfg.xfmt(d) : d);
    g.append("text").attr("x", (L + W - R) / 2).attr("y", H - 1).attr("text-anchor", "middle")
      .attr("font-size", 12).attr("fill", "#444").text(cfg.xTitle || "");
    g.append("text").attr("transform", "rotate(-90)").attr("x", -(H / 2)).attr("y", 12)
      .attr("text-anchor", "middle").attr("font-size", 12).attr("fill", "#444").text(cfg.yTitle || "");
    if (cfg.zero) {
      g.append("line").attr("x1", L).attr("x2", W - R).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", "#ccc");
    }
    cfg.series.forEach((s) => {
      if (s.bars) {
        const bw = cats ? Math.max(4, (x.step ? x.step() : 18) * 0.55) : Math.max(3, (x(s.pts[1].x) - x(s.pts[0].x)) * 0.55);
        g.append("g").selectAll("rect").data(s.pts).join("rect")
          .attr("x", (p) => x(p.x) - bw / 2)
          .attr("width", bw)
          .attr("y", (p) => Math.min(y(p.y), y(0)))
          .attr("height", (p) => Math.abs(y(p.y) - y(0)))
          .attr("fill", s.color);
      } else {
        g.append("path")
          .attr("d", d3.line().x((p) => x(p.x)).y((p) => y(p.y)).curve(d3.curveLinear)(s.pts))
          .attr("fill", "none").attr("stroke", s.color).attr("stroke-width", 2);
        g.append("g").selectAll("circle").data(s.pts).join("circle")
          .attr("cx", (p) => x(p.x)).attr("cy", (p) => y(p.y)).attr("r", cats && cats.length < 30 ? 3.5 : 0)
          .attr("fill", s.color);
      }
    });
    const tip = document.createElement("div");
    tip.className = "fx-tip";
    el.appendChild(tip);
    svg.append("rect").attr("x", L).attr("y", 0).attr("width", W - L - R).attr("height", H - 36).attr("fill", "transparent")
      .on("pointermove", (ev) => {
        const [mx] = d3.pointer(ev);
        const xv = cats ? cats.reduce((best, c) => Math.abs(x(c) - mx) < Math.abs(x(best) - mx) ? c : best, cats[0]) : x.invert(mx);
        const ref = cfg.series[0].pts;
        const i = cats ? ref.findIndex((p) => p.x === xv) : d3.bisector((p) => p.x).center(ref, xv);
        const row = ref[Math.max(0, i)];
        tip.replaceChildren();
        const t = document.createElement("div");
        t.className = "t";
        t.textContent = cfg.xfmt ? cfg.xfmt(row.x) : String(row.x);
        tip.appendChild(t);
        cfg.series.forEach((s) => {
          const p = cats ? s.pts.find((q) => q.x === row.x) : s.pts[d3.bisector((q) => q.x).center(s.pts, row.x)];
          if (!p) return;
          const line = document.createElement("div");
          line.className = "r";
          line.textContent = s.name + ": " + cfg.yfmt(p.y);
          tip.appendChild(line);
        });
        tip.style.display = "block";
        tip.style.left = Math.min(el.clientWidth - tip.offsetWidth - 8, Math.max(0, mx + 12)) + "px";
        tip.style.top = "8px";
      })
      .on("pointerleave", () => { tip.style.display = "none"; });
  }

  function legend(id, items) {
    const el = document.getElementById(id);
    el.replaceChildren();
    items.forEach((it) => {
      const s = document.createElement("span");
      const i = document.createElement("i");
      i.style.background = it.color;
      s.append(i, document.createTextNode(it.name));
      el.appendChild(s);
    });
  }

  const f2 = (v) => d3.format(".2f")(v);
  const f3 = (v) => d3.format(".3f")(v);
  const f4 = (v) => d3.format(".4f")(v);

  function drawAll() {
    if (!document.getElementById("p-daily").classList.contains("on")) {
      /* still draw hidden panels once they are shown; width is 0 until shown */
    }
    const daily = document.getElementById("ch-daily");
    if (document.getElementById("p-daily").classList.contains("on")) {
      legend("lg-daily", [{ name: "2026-09-25", color: C1 }, { name: "2026-09-28", color: C2 }]);
      chart(daily, {
        series: [
          { name: "2026-09-25", color: C1, pts: D.daily.x.map((x, i) => ({ x, y: D.daily.a[i] })) },
          { name: "2026-09-28", color: C2, pts: D.daily.x.map((x, i) => ({ x, y: D.daily.b[i] })) }
        ],
        xdom: [-0.3, 100.3], xticks: D.ticks.vals, xfmt: (v) => {
          const i = D.ticks.vals.indexOf(v);
          return i >= 0 ? D.ticks.text[i] : deltaName(v);
        },
        yfmt: f2, xTitle: "Delta", yTitle: "Implied Volatility (%)"
      });
      chart(document.getElementById("ch-chg"), {
        series: [{ name: "Change", color: C1, bars: true, pts: D.daily.x.map((x, i) => ({ x, y: D.daily.change[i] })) }],
        xdom: [-0.3, 100.3], xticks: D.ticks.vals, xfmt: (v) => {
          const i = D.ticks.vals.indexOf(v);
          return i >= 0 ? D.ticks.text[i] : deltaName(v);
        },
        yfmt: (v) => d3.format("+.2f")(v), xTitle: "Delta", yTitle: "Δ IV (Vol Pts)", zero: true
      });
    }
    if (document.getElementById("p-hist").classList.contains("on")) {
      const dates = D.historical.dates;
      const every = Math.ceil(dates.length / 8);
      legend("lg-hist", [{ name: "25Δ P", color: C1 }, { name: "25Δ C", color: C2 }]);
      chart(document.getElementById("ch-hist"), {
        series: [
          { name: "25Δ P", color: C1, pts: dates.map((x, i) => ({ x, y: D.historical.put25[i] })) },
          { name: "25Δ C", color: C2, pts: dates.map((x, i) => ({ x, y: D.historical.call25[i] })) }
        ],
        cats: dates, every, xfmt: (d) => d.slice(0, 7), yfmt: f2,
        xTitle: "Date", yTitle: "Implied Volatility (%)"
      });
      chart(document.getElementById("ch-rr"), {
        series: [{ name: "25Δ RR (Put − Call)", color: C1, pts: dates.map((x, i) => ({ x, y: D.historical.rr25[i] })) }],
        cats: dates, every, xfmt: (d) => d.slice(0, 7), yfmt: f2,
        xTitle: "Date", yTitle: "Risk Reversal (Vol Pts)"
      });
    }
    if (document.getElementById("p-ts").classList.contains("on")) {
      const dates = D.spotSeries.dates;
      chart(document.getElementById("ch-spot"), {
        series: [{ name: "Spot", color: C1, pts: dates.map((x, i) => ({ x, y: D.spotSeries.y[i] })) }],
        cats: dates, every: Math.ceil(dates.length / 8), xfmt: (d) => d.slice(0, 7),
        yfmt: (v) => d3.format(",.0f")(v), xTitle: "Date", yTitle: "Value"
      });
    }
    if (document.getElementById("p-fly").classList.contains("on")) {
      legend("lg-fly", [{ name: "2026-09-25", color: C1 }, { name: "2026-09-28", color: C2 }]);
      chart(document.getElementById("ch-fly"), {
        series: [
          { name: "2026-09-25", color: C1, pts: D.fly.x.map((x, i) => ({ x, y: D.fly.a[i] })) },
          { name: "2026-09-28", color: C2, pts: D.fly.x.map((x, i) => ({ x, y: D.fly.b[i] })) }
        ],
        cats: D.fly.x, every: 2, yfmt: f4, xTitle: "Delta", yTitle: "IV Fly"
      });
      chart(document.getElementById("ch-flychg"), {
        series: [{ name: "Change", color: C1, bars: true, pts: D.fly.x.map((x, i) => ({ x, y: D.fly.change[i] })) }],
        cats: D.fly.x, every: 2, yfmt: (v) => d3.format("+.4f")(v), xTitle: "Delta", yTitle: "Δ IV Fly", zero: true
      });
    }
    if (document.getElementById("p-fix").classList.contains("on")) {
      const xs = D.fixed.putX.concat(D.fixed.callX);
      legend("lg-fix", [
        { name: "2026-09-25 Put", color: C1 },
        { name: "2026-09-25 Call", color: "#ab63fa" },
        { name: "2026-09-28 Put", color: C2 },
        { name: "2026-09-28 Call", color: "#ffa15a" }
      ]);
      chart(document.getElementById("ch-fix"), {
        series: [
          { name: "2026-09-25 Put", color: C1, pts: D.fixed.putX.map((x, i) => ({ x, y: D.fixed.putA[i] })) },
          { name: "2026-09-25 Call", color: "#ab63fa", pts: D.fixed.callX.map((x, i) => ({ x, y: D.fixed.callA[i] })) },
          { name: "2026-09-28 Put", color: C2, pts: D.fixed.putX.map((x, i) => ({ x, y: D.fixed.putB[i] })) },
          { name: "2026-09-28 Call", color: "#ffa15a", pts: D.fixed.callX.map((x, i) => ({ x, y: D.fixed.callB[i] })) }
        ],
        cats: xs, every: 2, yfmt: f4, xTitle: "Strike Offset (ATM-relative)", yTitle: "IV Fly (×100, vol pts)"
      });
      chart(document.getElementById("ch-fixchg"), {
        series: [{ name: "Δ Fly", color: C1, bars: true, pts: D.fixed.changeX.map((x, i) => ({ x, y: D.fixed.changeY[i] })) }],
        cats: D.fixed.changeX, every: 2, yfmt: (v) => d3.format("+.4f")(v),
        xTitle: "Strike Offset (ATM-relative)", yTitle: "Change in IV Fly (vol pts)", zero: true
      });
    }
  }

  const tb = document.querySelector("#s60-metrics tbody");
  D.daily.x.forEach((x, i) => {
    const d = D.daily.change[i];
    const tr = document.createElement("tr");
    [deltaName(x), f2(D.daily.a[i]), f2(D.daily.b[i]), (d > 0 ? "+" : "") + f2(d)].forEach((t, j) => {
      const td = document.createElement("td");
      td.textContent = t;
      if (j === 3) td.className = d > 0 ? "up" : d < 0 ? "dn" : "";
      tr.appendChild(td);
    });
    tb.appendChild(tr);
  });

  drawAll();
  let timer;
  window.addEventListener("resize", () => { clearTimeout(timer); timer = setTimeout(drawAll, 120); });
})();
