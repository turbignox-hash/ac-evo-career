# -*- coding: utf-8 -*-
"""La VERA coppia: Fulminato (ieri 23:15) vs Chiamata a casa (oggi 16:55)."""
import json, os, glob, hashlib

BASE = r"C:/Users/Mauro/Documents/MetalVideoAutoEditor"
pl = {}
for d in sorted(glob.glob(os.path.join(BASE, "snapshot_*"))):
    p = os.path.join(d, "plan.json")
    if os.path.exists(p):
        plans_d = json.load(open(p, encoding="utf-8"))
        pl[d.split("_")[-1]] = (d, plans_d)

# Fulminato = quello con final_name 'Fulminato - montaggio.mp4' più recente (6xw0)
fulminato = [k for k, (d, p) in pl.items() if "Fulminato" in p.get("final_name", "")]
fulk = fulminato[-1]
chiamata = [k for k, (d, p) in pl.items() if "Chiamata" in p.get("final_name", "")][0]

_, pf = pl[fulk]
_, pc = pl[chiamata]
print(f"Fulminato ({fulk}): {len(pf['shots'])} shot | Chiamata ({chiamata}): {len(pc['shots'])} shot | mode Chiamata: {pc.get('mode')}")

# Futuro: i vecchi piani non hanno src → usa il contenuto della COPIA (stesso byte della
# clip originale) → match per dimensione del file snapshot vs i vault? Più semplice:
# hash del contenuto dei 2 snapshot se l'utente ha ancora i file.
def file_hash(p):
    h = hashlib.md5()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()

sh_f = [(s["folder"], os.path.basename(s["file"])) for s in pf["shots"]]
sh_c = [(s["folder"], os.path.basename(s["file"])) for s in pc["shots"]]
n = min(len(sh_f), len(sh_c))
same_pos = sum(1 for x, y in zip(sh_f[:n], sh_c[:n]) if x[0] == y[0] and x[1].split("_", 1)[1] == y[1].split("_", 1)[1])
print(f"\nstesso 'ruolo cartella' stessa posizione: {same_pos}/{n} (indicativo solo, nome copia = progressivo+folder)")
print("primi 6 F:", [f"{a}/{b}" for a, b in sh_f[:6]])
print("primi 6 C:", [f"{a}/{b}" for a, b in sh_c[:6]])

# VERDA: hash del contenuto delle copie, se esistono entrambe
exist_f = [os.path.exists(s['file']) for s in pf['shots']]
exist_c = [os.path.exists(s['file']) for s in pc['shots']]
print("snapshot Fulminato esistenti:", sum(exist_f), "/", len(pf["shots"]), "| Chiamata:", sum(exist_c), "/", len(pc["shots"]))
