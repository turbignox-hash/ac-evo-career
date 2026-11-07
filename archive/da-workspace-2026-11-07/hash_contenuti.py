# -*- coding: utf-8 -*-
"""Verita' sul contenuto: hash md5 delle clip copiate Fulminato (ieri) vs Chiamata (oggi)."""
import json, os, glob, hashlib, collections

BASE = r"C:/Users/Mauro/Documents/MetalVideoAutoEditor"
plans = {}
for d in sorted(glob.glob(os.path.join(BASE, "snapshot_*"))):
    p = os.path.join(d, "plan.json")
    if os.path.exists(p):
        key = d.split("_")[-1]
        pl = json.load(open(p, encoding="utf-8"))
        plans[key] = pl

fulminato = [k for k, p in plans.items() if "Fulminato" in p.get("final_name", "")][-1]
chiamata = [k for k, p in plans.items() if "Chiamata" in p.get("final_name", "")][0]
pf, pc = plans[fulminato], plans[chiamata]
print(f"hashing {len(pf['shots'])}+{len(pc['shots'])} clip reali...")

def hash_file(p):
    h = hashlib.md5()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()

hf = [hash_file(s["file"]) for s in pf["shots"]]
hc = [hash_file(s["file"]) for s in pc["shots"]]

set_f, set_c = set(hf), set(hc)
common = set_f & set_c
print(f"clip in comune (contenuto identico): {len(common)} su |F|={len(set_f)} |C|={len(set_c)}")

same_pos = sum(1 for a, b in zip(hf, hc[:len(hf)]) if a == b)
print(f"stesso contenuto nella STESSA posizione: {same_pos}/{len(hf)}")

if common:
    pos_in_c = {h: i for i, h in enumerate(hc)}
    esempi = [(i, pos_in_c[h]) for i, h in enumerate(hf) if h in pos_in_c][:12]
    print("esempi (pos_F -> pos_C):", esempi)
