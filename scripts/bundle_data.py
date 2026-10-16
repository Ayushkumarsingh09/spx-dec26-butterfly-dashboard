"""Rebuild js/data.js from the pretty JSON files in data/.

The page loads js/data.js so it works when opened as a file (no server).
Edit the JSON, then run:  python scripts/bundle_data.py
"""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
keys = ("smile_grid", "chain_quotes", "market_inputs")
data = {key: json.loads((root / "data" / f"{key}.json").read_text(encoding="utf-8")) for key in keys}
out = root / "js" / "data.js"
out.write_text("window.DASH_DATA = " + json.dumps(data, separators=(",", ":")) + ";\n", encoding="utf-8")
print(f"wrote {out} ({out.stat().st_size} bytes)")
