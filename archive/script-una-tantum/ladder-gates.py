# -*- coding: utf-8 -*-
"""
Cancelli di accesso alla carriera, in stile realta':
- rimuove le catene "serve top N in ...": ogni serie visibile e raggiungibile
- richiede REPUTAZIONE per firmare, scalata sul livello (la F1 esige piu' di tutti)
- allunga i calendari delle serie originali a 7-9 gare sulle 15 piste
Idempotente, con backup automatico. Da lanciare DOPO expand-ladder.py:
  py -3.12 tools/ladder-gates.py
"""
import json
import os
import random
import shutil
import sys
from datetime import datetime

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LADDER = os.path.join(BASE, "career.evo.ladder.json")

TRACKS = ["monza", "imola", "redbull_ring", "fuji", "suzuka", "mount_panorama",
          "nurburgring", "sebring", "spa", "brands_hatch", "laguna_seca",
          "circuit_of_the_americas", "donington_park", "kyalami", "paul_ricard"]
HOURS = [12, 13, 14, 15, 16]

# Reputazione richiesta per firmare, per livello (F1: massima di tutte).
REP_LEVEL = {1: 20, 2: 40, 3: 70, 4: 110, 5: 160, 6: 220, 7: 300}
REP_F1 = 400


def f1_like(node):
    """Le monoposto (F2004/SF-25) sono l'obiettivo finale: rep richiesta massima."""
    name = (node.get("nodeId", "") + " " + node.get("display", "")).lower()
    return node.get("discipline") == "single" or "f2004" in name or "sf-25" in name or "formula" in name


def build_calendar(rng, old_cal):
    """7-9 gare: mescola le piste vecchie con le nuove, tiene nomi/ore/meteo nuovi."""
    n = rng.choice([7, 8, 9])
    old_tracks = [r["track"] for r in old_cal]
    picks = list(dict.fromkeys(old_tracks + rng.sample(TRACKS, n)))
    rng.shuffle(picks)
    picks = picks[:n]
    if len(picks) < n:
        picks += [t for t in rng.sample(TRACKS, n) if t not in picks]
        picks = picks[:n]
    cal = []
    for i, t in enumerate(picks):
        tag = "Finale" if i == len(picks) - 1 else f"Round {i + 1}"
        cal.append({"track": t, "name": f"{t} - {tag}", "laps": rng.choice([6, 7, 8, 9, 10]),
                    "hour": rng.choice(HOURS), "weather": rng.choice([0, 1, 2, 3])})
    return cal


def main():
    with open(LADDER, encoding="utf-8") as fh:
        ladder = json.load(fh)

    backup = os.path.join(BASE, "data", f"ladder.backup-gates-{datetime.now():%Y%m%d-%H%M%S}.json")
    shutil.copyfile(LADDER, backup)

    rep_set, cal_set = 0, 0
    for node in ladder["nodes"]:
        if node.get("requires"):
            node["requires"] = None
        if node.get("access") == "open":
            node["access"] = "rep"
        rep = REP_F1 if f1_like(node) else REP_LEVEL[min(7, max(1, node.get("level", 3)))]
        node["repRequired"] = rep
        rep_set += 1
        if node["nodeId"].startswith("coppa_"):
            continue  # i calendari delle coppe sono gia' lunghi (expand-ladder)
        if len(node.get("calendar", [])) < 7:
            node["calendar"] = build_calendar(random.Random(node["nodeId"]), node["calendar"])
            cal_set += 1

    ladder["_nota_gates"] = ("Accesso con soldi + reputazione (repRequired per livello; F1 400). "
                             "Catene 'top N' rimosse: si firma dove il budget e la rep lo permettono. "
                             "Generato da tools/ladder-gates.py")

    with open(LADDER, "w", encoding="utf-8") as fh:
        json.dump(ladder, fh, ensure_ascii=False, indent=1)

    print(f"rep impostata su {rep_set} nodi, calendari allungati su {cal_set} serie originali")
    print("backup:", os.path.relpath(backup, BASE))
    f1 = [n for n in ladder["nodes"] if f1_like(n)]
    for n in f1:
        print(f"F1: {n['display']} richiede rep {n['repRequired']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
