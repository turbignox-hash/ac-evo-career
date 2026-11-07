# -*- coding: utf-8 -*-
import json, os, glob, hashlib

BASE = r"C:/Users/Mauro/Documents/MetalVideoAutoEditor"
plans = []
for d in sorted(glob.glob(os.path.join(BASE, "snapshot_*"))):
    p = os.path.join(d, "plan.json")
    if not os.path.exists(p):
        continue
    pl = json.load(open(p, encoding="utf-8"))
    shots = pl.get("shots", [])
    # identifica il file sorgente originale di ogni shot
    seq = []
    for s in shots:
        src = s.get("src") or s.get("orig") or s.get("source") or ""
        if not src:
            # il 'file' del snapshot e' la copia rinumerata: usa folder + chiavi utili
            src = s.get("file", "")
        seq.append((s.get("folder"), os.path.basename(str(src)), s.get("start"), s.get("sec")))
    h = hashlib.md5(json.dumps([(a, b) for a, b, _, _ in seq], ensure_ascii=False).encode()).hexdigest()[:10]
    plans.append({
        "snap": os.path.basename(d),
        "song": pl.get("song"),
        "final": pl.get("final_name"),
        "n": len(shots),
        "hash": h,
        "seq": seq,
    })
    print(f"{os.path.basename(d)}: song={pl.get('song')} | final={pl.get('final_name')} | shots={len(shots)} | hashSeq={h}")
    print("   primi 5:", [(f, sec, st) for f, _, st, sec in seq[:5]])

# chiavi di uno shot per capire i campi
d0 = sorted(glob.glob(os.path.join(BASE, "snapshot_*")))[0]
pl0 = json.load(open(os.path.join(d0, "plan.json"), encoding="utf-8"))
print("\ncampi shot:", list(pl0["shots"][0].keys()))
print("esempio shot completo:", json.dumps(pl0["shots"][0], ensure_ascii=False)[:400])

# overlap tra ultimi due piani (ieri 23:28 vs oggi)
if len(plans) >= 2:
    a, b = plans[-2], plans[-1]
    same_pos = sum(1 for x, y in zip(a["seq"], b["seq"]) if x[1] == y[1])
    setA = set(x[1] for x in a["seq"]); setB = set(x[1] for x in b["seq"])
    print(f"\nOVERLAP {a['snap']} vs {b['snap']}: stessa clip stessa posizione: {same_pos}/{min(a['n'], b['n'])}")
    print(f"clip in comune (insieme): {len(setA & setB)} su |A|={len(setA)} |B|={len(setB)}")
