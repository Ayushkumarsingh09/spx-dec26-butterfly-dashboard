/* SVG line charts with a shared strike axis (offset from the scenario ATM). */
(function (global) {
  const fmtOff = (d) => d === 0 ? "ATM" : "ATM" + (d > 0 ? "+" : "−") + d3.format(",")(Math.abs(d));

  function lineChart(el, cfg) {
    el.replaceChildren();
    const W = Math.max(280, el.clientWidth);
    const H = 280;
    const svg = d3.select(el).append("svg").attr("width", "100%").attr("viewBox", `0 0 ${W} ${H}`);

    let [y0, y1] = d3.extent(cfg.series.flatMap((s) => s.pts.map((p) => p.y)));
    if (cfg.zero) { y0 = Math.min(y0, 0); y1 = Math.max(y1, 0); }
    if (y1 - y0 < 1e-6) { y0 -= 1; y1 += 1; }
    const pad = (y1 - y0) * 0.06;
    y0 -= pad;
    y1 += pad;
    const y = d3.scaleLinear([y0, y1], [H - 30, 10]).nice(5);

    let y2 = null;
    if (cfg.series2) {
      let [a, b] = d3.extent(cfg.series2.flatMap((s) => s.pts.map((p) => p.y)));
      a = Math.min(a, 0);
      b = Math.max(b, 0);
      if (b - a < 1e-6) { a -= 0.05; b += 0.05; }
      y2 = d3.scaleLinear([a, b], [H - 30, 10]).nice(5);
    }

    const meas = svg.append("g").attr("font-size", 11);
    const widthOf = (labels) => {
      let m = 0;
      labels.forEach((t) => {
        const n = meas.append("text").text(t);
        m = Math.max(m, n.node().getComputedTextLength());
        n.remove();
      });
      return m;
    };
    const yt = y.ticks(5);
    const ytl = yt.map(cfg.yfmt);
    const L = Math.ceil(widthOf(ytl)) + 10;
    let R = 12;
    let y2t;
    let y2tl;
    if (y2) {
      y2t = y2.ticks(5);
      y2tl = y2t.map(cfg.y2fmt);
      R = Math.ceil(widthOf(y2tl)) + 10;
    }
    const sampleW = widthOf(["ATM−1,000"]) + 14;
    meas.remove();

    const x = d3.scaleLinear(cfg.xdom, [L, W - R]);
    const atm = cfg.atm;
    const span = cfg.xdom[1] - cfg.xdom[0];
    const steps = [50, 100, 200, 250, 500, 1000];
    const step = steps.find((s) => (span / s + 1) * sampleW <= (W - L - R)) || 1000;
    const offs = d3.range(Math.ceil((cfg.xdom[0] - atm) / step) * step, cfg.xdom[1] - atm + 0.001, step);

    const g = svg.append("g");
    g.selectAll("line.gy").data(yt).join("line")
      .attr("x1", L).attr("x2", W - R)
      .attr("y1", (d) => y(d)).attr("y2", (d) => y(d))
      .attr("stroke", "var(--cds-chart-grid)").attr("stroke-width", 1);
    g.selectAll("text.ty").data(yt).join("text")
      .attr("x", L - 6).attr("y", (d) => y(d)).attr("dy", "0.32em")
      .attr("text-anchor", "end").attr("font-size", 11)
      .attr("fill", "var(--color-fg-muted)").text(cfg.yfmt);
    if (y2) {
      g.selectAll("text.ty2").data(y2t).join("text")
        .attr("x", W - R + 6).attr("y", (d) => y2(d)).attr("dy", "0.32em")
        .attr("font-size", 11).attr("fill", cfg.series2[0].color).text(cfg.y2fmt);
    }
    g.append("line").attr("x1", L).attr("x2", W - R).attr("y1", H - 30).attr("y2", H - 30)
      .attr("stroke", "var(--cds-chart-axis)");
    g.selectAll("text.tx").data(offs).join("text")
      .attr("x", (d) => x(atm + d)).attr("y", H - 12)
      .attr("text-anchor", "middle").attr("font-size", 11)
      .attr("fill", "var(--color-fg-muted)")
      .attr("font-weight", (d) => d === 0 ? 600 : null)
      .text(fmtOff);
    g.append("line").attr("x1", x(atm)).attr("x2", x(atm)).attr("y1", 10).attr("y2", H - 30)
      .attr("stroke", "var(--cds-chart-reference)").attr("stroke-dasharray", "4 3");
    if (cfg.zero) {
      g.append("line").attr("x1", L).attr("x2", W - R).attr("y1", y(0)).attr("y2", y(0))
        .attr("stroke", "var(--cds-chart-axis)");
    }
    if (cfg.todayAtm != null && cfg.todayAtm !== atm && cfg.todayAtm >= cfg.xdom[0] && cfg.todayAtm <= cfg.xdom[1]) {
      g.append("line").attr("x1", x(cfg.todayAtm)).attr("x2", x(cfg.todayAtm)).attr("y1", 10).attr("y2", H - 30)
        .attr("stroke", "var(--cds-chart-muted)").attr("stroke-dasharray", "2 3");
      g.append("text").attr("x", x(cfg.todayAtm) + 4).attr("y", 20).attr("font-size", 10)
        .attr("fill", "var(--color-fg-muted)").text("today ATM");
    }

    const clip = "fxclip" + Math.random().toString(36).slice(2);
    svg.append("clipPath").attr("id", clip).append("rect")
      .attr("x", L).attr("y", 6).attr("width", W - L - R).attr("height", H - 36);
    const plot = svg.append("g").attr("clip-path", `url(#${clip})`);

    const draw = (s, yy) => {
      if (s.dots) {
        plot.append("g").selectAll("circle").data(s.pts).join("circle")
          .attr("cx", (p) => x(p.x)).attr("cy", (p) => yy(p.y))
          .attr("r", 2.2).attr("fill", s.color).attr("opacity", 0.55);
      } else {
        plot.append("path")
          .attr("d", d3.line().x((p) => x(p.x)).y((p) => yy(p.y))(s.pts))
          .attr("fill", "none").attr("stroke", s.color)
          .attr("stroke-width", s.w || 2)
          .attr("stroke-dasharray", s.dash || null)
          .attr("stroke-linecap", "round").attr("stroke-linejoin", "round");
      }
    };
    cfg.series.forEach((s) => draw(s, y));
    if (y2) cfg.series2.forEach((s) => draw(s, y2));

    const tip = document.createElement("div");
    tip.className = "fx-tip";
    el.appendChild(tip);
    const hov = svg.append("g").style("display", "none");
    const rule = hov.append("line").attr("y1", 10).attr("y2", H - 30).attr("stroke", "var(--cds-chart-axis)");
    const lineSeries = cfg.series.filter((s) => !s.dots).map((s) => [s, y])
      .concat(y2 ? cfg.series2.map((s) => [s, y2]) : []);
    const dots = lineSeries.map(([s]) => hov.append("circle").attr("r", 3.5).attr("fill", s.color));
    svg.append("rect").attr("x", L).attr("y", 0).attr("width", W - L - R).attr("height", H - 30).attr("fill", "transparent")
      .on("pointermove", (ev) => {
        const [mx] = d3.pointer(ev);
        const xv = x.invert(mx);
        const ref = lineSeries[0][0].pts;
        const i = d3.bisector((p) => p.x).center(ref, xv);
        const xx = ref[i].x;
        hov.style("display", null);
        rule.attr("x1", x(xx)).attr("x2", x(xx));
        tip.replaceChildren();
        const t = document.createElement("div");
        t.className = "t";
        t.textContent = `K ${d3.format(",")(xx)} · ${fmtOff(xx - atm)}`;
        tip.appendChild(t);
        lineSeries.forEach(([s, yy], j) => {
          const p = s.pts[d3.bisector((q) => q.x).center(s.pts, xx)];
          dots[j].attr("cx", x(p.x)).attr("cy", yy(p.y));
          const row = document.createElement("div");
          row.className = "r";
          const sw = document.createElement("i");
          sw.style.background = s.color;
          const tx = document.createElement("span");
          tx.textContent = `${s.name}: ${(s.fmt || cfg.yfmt)(p.y)}`;
          row.append(sw, tx);
          tip.appendChild(row);
        });
        tip.style.display = "block";
        const bw = el.clientWidth;
        const tw = tip.offsetWidth;
        const px = x(xx) * bw / W;
        tip.style.left = Math.max(0, Math.min(bw - tw, px + 12 > bw - tw ? px - tw - 12 : px + 12)) + "px";
        tip.style.top = "8px";
      })
      .on("pointerleave", () => {
        hov.style("display", "none");
        tip.style.display = "none";
      });
  }

  function legend(id, items) {
    const el = document.getElementById(id);
    el.replaceChildren();
    items.forEach((it) => {
      const s = document.createElement("span");
      const i = document.createElement("i");
      i.className = it.dots ? "o" : it.dash ? "d" : "";
      if (it.dots) i.style.background = it.color;
      else i.style.borderTopColor = it.color;
      s.append(i, document.createTextNode(it.name));
      el.appendChild(s);
    });
  }

  function fail(ids, status) {
    ids.forEach((id) => {
      const el = document.getElementById(id);
      el.replaceChildren();
      if (status === "error" || status === "connect") {
        const f = document.createElement("div");
        f.className = "fx-fail";
        f.textContent = "Failed to load";
        el.appendChild(f);
      }
    });
  }

  global.FlyChart = { lineChart, legend, fail, fmtOff };
})(window);
