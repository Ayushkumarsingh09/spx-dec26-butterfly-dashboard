# SPX 18-Dec-26 strike butterfly scenario lab

Offline dashboard for fixed-strike SPX butterflies on the 18 December 2026 expiry. Move the spot, vol, skew and wing sliders and every chart and table reprices immediately.

Open `index.html` in a browser. Market data is bundled in `js/data.js`, so the page does not need a server and does not send anything off the machine.

## What it prices

- **Black-76** calls and puts. Discount factor uses the 4.33% rate from the grid header. Forward is 7,848.27 and time to expiry is 68.19/365 years, chosen so Black-76 at the quoted mid IVs reproduces the quoted mids (worst error about 0.37 index points).
- **Today’s smile** is the fitted grid in `data/smile_grid.json` (linear in strike between 5-point nodes, from 5,000 to 10,000). Dots on the smile chart are the out-of-the-money mid IVs used in that fit: puts below the forward, calls at or above it (`data/chain_quotes.json`).
- **Scenario smile** at strike K, with x = 100·ln(K / F):

  σ(K) = σ_today(K′) + shift + skew·x + curvature·x² + wing·x²

  Put-wing applies for x < 0 and call-wing for x > 0. Sticky strike uses K′ = K. Sticky moneyness uses K′ = K · F_today / F_scenario. Vol is floored at 0.5%.
- **Butterfly** is long 1 / short 2 / long 1 with equal wings. Fly IV is (σ_low + σ_high) / 2 − σ_centre. Call and put flies match by put–call parity; the legs table shows both.

Flat vol replaces the fitted smile with one number (default 12.87%, the ATM vol) for both today and the scenario.

## Layout

| Path | Role |
| --- | --- |
| `index.html` | Page |
| `css/app.css` | Layout, light and dark |
| `js/pricing.js` | Black-76, smile, butterfly |
| `js/chart.js` | Strike-axis charts |
| `js/app.js` | Sliders, saved curves, tables |
| `js/data.js` | Data bundle the page loads |
| `data/*.json` | Same data, readable |
| `js/vendor/d3.min.js` | D3 7.9.0 |

Saved comparison curves live only in the page session (up to six). Double-click a slider to restore its default.

After editing a JSON file, rebuild the bundle:

```
python scripts/bundle_data.py
```
