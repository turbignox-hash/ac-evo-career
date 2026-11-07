# -*- coding: utf-8 -*-
"""Verifica overlap tra le ultime 2 creazioni: Cavaliere (15:09) vs Chiamata a casa (16:52)."""
import json, os, glob

BASE = r"C:/Users/Mauro/Documents/MetalVideoAutoEditor"
plans = {}
for d in sorted(glob.glob(os.path.join(BASE, "snapshot_*"))):
    p = os.path.join(d, "plan.json")
    if os.path.exists(p):
        pl = json.load(open(p, encoding="utf-8"))
        plans[d.split("_")[-1]] = pl
        print(d, "| final:", pl.get("final_name"), "| mode:", pl.get("mode", "(vecchio engine, no mode)"),
              "| shot:", len(pl.get("shots", [])), "| campi shot:", list(pl["shots"][0].keys()) if pl.get("shots") else "-")

keys = list(plans.keys())
if len(keys) >= 2:
    a = plans[keys[-2]]  # Cavaliere (15:09)
    b = plans[keys[-1]]  # Chiamata (16:52)
    fa = [os.path.basename(s["file"]).split("_", 1)[1] for s in a["shots"]]
    fb = [os.path.basename(s["file"]).split("_", 1)[1] for s in b["shots"]]
    n = min(len(fa), len(fb))
    same_pos = sum(1 for x, y in zip(fa[:n], fb[:n]) if x == y)
    print(f"\nOVERLAP {keys[-2]} vs {keys[-1]}: stesso shot stessa posizione: {same_pos}/{n}")
    print("primi 6 A:", fa[:6])
    print("primi 6 B:", fb[:6])
    folders_a = len({s["folder"] for s in a["shots"]})
    folders_b = len({s["folder"] for s in b["shots"]})
    print("cartelle distinte: A =", folders_a, "| B =", folders_b)

# stato memoria al momento di Chiamata
h = json.load(open(r"H:/Metal Video generation auto/data/eddie-montage-history.json", encoding="utf-8"))
print("\nstoria attuale: montaggi =", len(h.get("montages", [])), "| clip =", len(h.get("clips", [])))
for m in h.get("montages", [])[-3:]:
    print("  -", m.get("song"), m.get("date"), len(m.get("clips", [])), "clip")
