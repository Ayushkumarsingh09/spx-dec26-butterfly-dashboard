/* Black-76 pricing and the fixed-strike butterfly smile.
   Vols in the smile are percent (12.87 = 12.87%). price() takes decimal vol. */
(function (global) {
  function erfc(x) {
    const z = Math.abs(x);
    const t = 1 / (1 + 0.5 * z);
    const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
    return x >= 0 ? r : 2 - r;
  }

  const normCdf = (x) => 0.5 * erfc(-x / Math.SQRT2);

  function blackCall(F, K, sigma, T, DF) {
    const sT = sigma * Math.sqrt(T);
    const d1 = (Math.log(F / K) + 0.5 * sT * sT) / sT;
    return DF * (F * normCdf(d1) - K * normCdf(d1 - sT));
  }

  function blackPut(F, K, sigma, T, DF) {
    const sT = sigma * Math.sqrt(T);
    const d1 = (Math.log(F / K) + 0.5 * sT * sT) / sT;
    return DF * (K * normCdf(sT - d1) - F * normCdf(-d1));
  }

  function price(type, F, K, sigma, model) {
    return type === "put"
      ? blackPut(F, K, sigma, model.T, model.DF)
      : blackCall(F, K, sigma, model.T, model.DF);
  }

  function buildModel(smileRows, marketRows) {
    const mk = marketRows[0];
    const grid = smileRows
      .map((r) => ({ k: Number(r.strike), v: Number(r.iv_smooth) }))
      .sort((a, b) => a.k - b.k);
    const T = Number(mk.days) / 365;
    const rate = Number(mk.rate);
    return {
      grid,
      F0: Number(mk.forward),
      T,
      DF: Math.exp(-rate * T),
      kmin: grid[0].k,
      kmax: grid[grid.length - 1].k,
      market: mk
    };
  }

  function baseIV(K, model, state) {
    if (state.base === "flat") return state.flatvol;
    const g = model.grid;
    if (K <= g[0].k) return g[0].v;
    if (K >= g[g.length - 1].k) return g[g.length - 1].v;
    let lo = 0;
    let hi = g.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (g[mid].k <= K) lo = mid + 1;
      else hi = mid;
    }
    const a = g[lo - 1];
    const b = g[lo];
    return a.v + (b.v - a.v) * (K - a.k) / (b.k - a.k);
  }

  const forward = (model, state) => model.F0 + state.move;

  function scenarioIV(K, model, state) {
    const F1 = forward(model, state);
    const Kref = state.sticky === "strike" ? K : K * model.F0 / F1;
    const x = 100 * Math.log(K / F1);
    const wing = (x < 0 ? state.pw : state.cw) * x * x;
    const v = baseIV(Kref, model, state) + state.shift + state.skew * x + state.curv * x * x + wing;
    return Math.max(v, 0.5);
  }

  const todayIV = (K, model, state) => baseIV(K, model, state);

  function fly(K, ivAt, F, model, state, type) {
    const w = state.wing;
    const sl = ivAt(K - w);
    const sm = ivAt(K);
    const sh = ivAt(K + w);
    const opt = type || state.opt;
    const leg = (k, volPct) => price(opt, F, k, volPct / 100, model);
    return {
      prem: leg(K - w, sl) + leg(K + w, sh) - 2 * leg(K, sm),
      fiv: (sl + sh) / 2 - sm,
      iv: sm
    };
  }

  const atmStrike = (F) => Math.round(F / 5) * 5;

  global.FlyMath = {
    buildModel,
    baseIV,
    forward,
    scenarioIV,
    todayIV,
    fly,
    atmStrike,
    price,
    blackCall,
    blackPut
  };
})(window);
