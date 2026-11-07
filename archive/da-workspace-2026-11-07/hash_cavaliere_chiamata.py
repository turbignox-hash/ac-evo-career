# -*- coding: utf-8 -*-
"""La coppia denunciata: Cavaliere del deserto (rinominato 'King Who Cannot Die') vs Chiamata a casa.
Confronto REALE per hash md5 del contenuto delle clip snapshot (non i nomi)."""
import json, os, glob, hashlib, collections

BASE = r"C:/Users/Mauro/Documents/MetalVideoAutoEditor"
plans = {}
for d in sorted(glob.glob(os.path.join(BASE, "snapshot_*"))):
    p = os.path.join(d, "plan.json")
    if os.path.exists(p):
        key = d.split("_")[-1]
        pl = json.load(open(p, encoding="utf-8"))
        plans[key] = pl
        print(d, "|", pl.get("final_name"), "| shot:", len(pl.get("shots", [])))

cav = [k for k, p in plans.items() if "Cavaliere del deserto" in p.get("final_name", "")][-1]
chi = [k for k, p in plans.items() if "Chiamata" in p.get("final_name", "")][0]
pf, pc = plans[cav], plans[chi]
print(f"\nCavaliere={cav} shot={len(pf['shots'])} | Chiamata={chi} shot={len(pc['shots'])} | mode C: {pc.get('mode')}")

def hash_file(p):
    h = hashlib.md5()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()

hf = [hash_file(s["file"]) for s in pf["shots"]]
hc = [hash_file(s["file"]) for s in pc["shots"]]
n = min(len(hf), len(hc))

same_pos = sum(1 for a, b in zip(hf[:n], hc[:n]) if a == b)
set_f, set_c = set(hf), set(hc)
common = set_f & set_c
print(f"\n>>> STESSO CONTENUTO nella STESSA POSIZIONE: {same_pos}/{n}")
print(f">>> clip in comune (insieme): {len(common)} su |C|={len(set_f)} |Ch|={len(set_c)}")

if common:
    pos_c = {h: i for i, h in enumerate(hc)}
    esempi = [(i, pos_c[h], os.path.basename(pf["shots"][i]["file"]), os.path.basename(pc["shots"][pos_c[h]]["file"]))
              for i, h in enumerate(hf) if h in pos_c]
    print("\nesempi di match (pos_Cav -> pos_Chi | file_Cav | file_Chi):")
    for i, j, f1, f2 in esempi[:12]:
        print(f"  {i:3d} -> {j:3d} | {f1[:44]} | {f2[:44]}")

# Le CARTELLE stesse posizioni
fsame = sum(1 for i in range(n) if pf["shots"][i]["folder"] == pc["shots"][i]["folder"])
print(f"\ncartelle uguali stessa posizione (per contesto photo-edit): {fsame}/{n}")
