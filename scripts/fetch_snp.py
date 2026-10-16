"""Pull the SNP 60-DTE ladders from the local ladder API into data/snp60.json."""
import json
import urllib.request
from pathlib import Path

BASE = "http://10.131.31.153:5000"
ROOT = Path(__file__).resolve().parents[1]

DELTA_SPEC = (
    [(d, "put") for d in (5, 10, 15, 20, 25, 30, 35, 40, 45)]
    + [("ATM", "call")]
    + [(d, "call") for d in (45, 40, 35, 30, 25, 20, 15, 10, 5)]
)

def delta_key(row):
    label = row["label_1"]
    if label == "ATM":
        return ("ATM", "call")
    parts = label.split()
    return (int(parts[0]), parts[-1])

def strike_offset(label):
    if label == "Call ATM":
        return 0
    if label.startswith("Put ATM"):
        return -int(label.split("-")[-1])
    if label.startswith("Call ATM+"):
        return int(label.split("+")[-1])
    return None

def get(url):
    with urllib.request.urlopen(url, timeout=120) as r:
        return json.load(r)

def main():
    dates = get(BASE + "/api/dates")
    rows_by_date = {}
    for i in range(0, len(dates), 25):
        chunk = dates[i:i + 25]
        url = BASE + "/api/merged?dates=" + ",".join(chunk)
        batch = get(url)
        for item in batch:
            rows_by_date[item["date"]] = item
        print(f"fetched {i + len(chunk)}/{len(dates)}")

    days = []
    skipped = 0
    strike_offsets = None
    for date in dates:
        item = rows_by_date.get(date)
        if not item or not item.get("ok"):
            skipped += 1
            continue
        by_delta = {delta_key(r): r for r in item["rows"]}
        div = []
        dprem = []
        ok = True
        for spec in DELTA_SPEC:
            row = by_delta.get(spec)
            if not row:
                ok = False
                break
            div.append(round(row["iv_1"] * 100, 4))
            dprem.append(round(row["premium_1"], 4))
        if not ok:
            skipped += 1
            continue
        strike_rows = sorted(
            ((strike_offset(r["label_2"]), r) for r in item["rows"]),
            key=lambda t: t[0] if t[0] is not None else 10**9,
        )
        strike_rows = [(off, r) for off, r in strike_rows if off is not None]
        offs = [off for off, _ in strike_rows]
        siv = [round(r["iv_2"] * 100, 4) for _, r in strike_rows]
        sp = [round(r["premium_2"], 4) for _, r in strike_rows]
        if strike_offsets is None:
            strike_offsets = offs
        elif offs != strike_offsets:
            # keep a per-day offset list only if the grid changes; it should not
            pass
        meta = item["meta"]
        days.append({
            "d": date,
            "u": round(meta["underlying"], 2),
            "atm": meta["atm_strike"],
            "iv": div,
            "dp": dprem,
            "siv": siv,
            "sp": sp,
        })
    out = {
        "source": "SNP 60-DTE ladder (nearest 60 DTE, 16:00 EOD, SPXW)",
        "deltaX": [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95],
        "strikeX": strike_offsets,
        "days": days,
    }
    path = ROOT / "data" / "snp60.json"
    path.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    js = ROOT / "js" / "smile-data.js"
    js.write_text("window.SMILE60 = " + json.dumps(out, separators=(",", ":")) + ";\n", encoding="utf-8")
    print("days", len(days), "skipped", skipped, "bytes", path.stat().st_size)

if __name__ == "__main__":
    main()
