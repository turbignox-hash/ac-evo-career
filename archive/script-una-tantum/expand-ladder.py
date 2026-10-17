# -*- coding: utf-8 -*-
"""
Espande la carriera: 1 coppa monomarca per OGNI auto del gioco, calendari
allungati (7-9 gare su 15 piste), tutti i campionati sbloccati (si entra se
il budget lo permette) e icone/risultati nelle tabelle Serie.
Mantiene _modello/_nota; i nodi originali restano invariati.
Backup automatico prima di scrivere.
  py -3.12 tools/expand-ladder.py
"""
import json
import os
import random
import shutil
import sys
from datetime import datetime

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LADDER = os.path.join(BASE, "career.evo.ladder.json")

# 15 piste (8 ufficiali + 7 nuove dal server dedicato, id compatibili col matcher)
TRACKS = ["monza", "imola", "redbull_ring", "fuji", "suzuka", "mount_panorama",
          "nurburgring", "sebring", "spa", "brands_hatch", "laguna_seca",
          "circuit_of_the_americas", "donington_park", "kyalami", "paul_ricard"]
HOURS = [12, 13, 14, 15, 16]
WEATHER = [0, 1, 2, 3]

ECON_LEVEL = {1: (30000, 900, 400, 3200), 2: (45000, 1500, 600, 4500),
              3: (70000, 3000, 900, 7000), 4: (150000, 6000, 1500, 12000),
              5: (260000, 12000, 2500, 22000), 6: (400000, 20000, 4000, 38000),
              7: (600000, 32000, 6000, 60000)}
AI_LEVEL = {1: [78, 88], 2: [80, 90], 3: [82, 92], 4: [85, 95], 5: [88, 98], 6: [90, 100], 7: [92, 102]}

# Mappa esplicita (disciplina, livello) per le auto che il PI da solo classifica male
OVERRIDE = {
    "ferrari296gt3": ("gt", 5), "ferrari488gt3": ("gt", 5), "bmwm4gt3": ("gt", 5),
    "fordmustanggt3": ("gt", 5), "porsche911gt3rrennsport": ("gt", 5),
    "audir8lmsgt4evo": ("gt", 4), "mercedesamggt2": ("endurance", 6),
    "porsche911gt3cup992": ("gt", 5), "ferrari488challengeevo": ("gt", 5),
    "ferrarif40lm": ("endurance", 6), "porsche935": ("endurance", 6),
    "mazdamx5ndcup": ("touring", 2), "porsche911gt3cup9922021": ("gt", 5),
    "ferrari296gtamb": ("endurance", 6), "lamborghinihuracansupertrofeoevo2": ("gt", 5),
    "lamborghinihuracansto": ("gt", 5), "porsche911gt3rs992": ("strada", 6),
    "lamborghinicountach": ("strada", 5), "lamborghinilpi7004": ("strada", 6),
    "ferrarif50": ("strada", 5), "ferrarif40": ("strada", 5), "porsche964turbo36": ("strada", 4),
    "toyotasprintertrueno1600gtapexae86": ("touring", 2), "datsun240z": ("touring", 2),
    "mazdarx7fd": ("touring", 3), "lanciadeltahfintegraleevoii": ("touring", 3),
    "renault5gtturbo": ("touring", 2), "peugeot205t16": ("touring", 3),
    "minijcs1990": ("touring", 2), "bmwm3e30evoiii": ("touring", 4),
    "mercedes190eevoii": ("touring", 4), "alfaromeo75turboevoluzione": ("touring", 3),
    "fordescortrscosworth": ("touring", 3), "bmwm3gtr": ("gt", 4),
    "bmwm3e46csagra": ("touring", 4), "bmwm4csl": ("strada", 4), "bmwm3e46csl": ("touring", 4),
}


def norm(s):
    import re
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def load_pi():
    """PI e categoria dal catalogo del server dedicato, salvato in cache da
    webui (data/_catalog-cache.json) o letto via API /api/catalog."""
    out = {}
    for cand in (os.path.join(BASE, "data", "_catalog-cache.json"),
                 os.path.join(BASE, "data", "car-images.json")):
        if not os.path.isfile(cand):
            continue
        with open(cand, encoding="utf-8") as fh:
            data = json.load(fh)
        cars = data.get("cars", data) if isinstance(data, dict) else data
        for c in cars or []:
            if isinstance(c, dict) and c.get("name") and c.get("pi") is not None:
                out[norm(c["name"])] = c
        if out:
            break
    return out


def classify(display, pi_data):
    """(disciplina, livello) dal PI: entry/touring per auto lente, gt/endurance
    per le racing, strada per le granturismo, single per le F1 (PI > 40)."""
    key = norm(display)
    hit = pi_data.get(key)
    if not hit:
        hit = next((v for k, v in pi_data.items() if k and (key.startswith(k) or k.startswith(key))), None)
    pi = hit.get("pi") if hit else None
    racing = (hit or {}).get("category") == "racing"
    name = norm(display)
    if name in OVERRIDE:
        return OVERRIDE[name]
    if "f2004" in name or "sf25" in name or "formula" in name:
        return "single", 6
    if pi is None:
        return "touring", 3
    if racing:
        if pi < 12: return "touring", 2         # cup giovani (MX-5 Cup)
        if pi < 14: return "touring", 3         # cup compatte
        if pi < 17: return "gt", 4              # GT4
        if pi < 20: return "gt", 5              # GT3 / Cup 992
        return "endurance", 6                   # GT2 / prototipi
    if pi < 12: return "entry", 1
    if pi < 14: return "entry", 2
    if pi < 16: return "strada", 4
    if pi < 18: return "strada", 5
    return "strada", 6                          # hypercar stradali


def build_calendar(rng):
    picks = rng.sample(TRACKS, rng.choice([7, 8, 9]))
    cal = []
    for i, t in enumerate(picks):
        tag = "Finale" if i == len(picks) - 1 else f"Round {i + 1}"
        cal.append({"track": t, "name": f"{t} - {tag}", "laps": rng.choice([6, 7, 8, 9, 10]),
                    "hour": rng.choice(HOURS), "weather": rng.choice(WEATHER)})
    return cal


def main():
    with open(LADDER, encoding="utf-8") as fh:
        ladder = json.load(fh)
    contentNames = ladder["contentNames"]["cars"]
    existing = {n["nodeId"] for n in ladder["nodes"]}
    pi_data = load_pi()

    backup = os.path.join(BASE, "data", f"ladder.backup-{datetime.now():%Y%m%d-%H%M%S}.json")
    shutil.copyfile(LADDER, backup)

    added, skipped = [], []
    for car_id, display in contentNames.items():
        disc, level = classify(display, pi_data)
        node_id = "coppa_" + car_id.replace("ks_", "").replace("_", "-")
        if node_id in existing:
            continue
        rng = random.Random(car_id)
        buy, rent, entry, prize = ECON_LEVEL[level]
        node = {
            "nodeId": node_id, "display": f"Coppa {display}", "discipline": disc, "level": level,
            "access": "open", "requires": None,
            "points": "one_make", "profile": "sprint" if level >= 3 else "club_short",
            "gridSize": 14 + (level >= 4) * 2, "ai": AI_LEVEL[level],
            "econ": {"phase": level, "disc": disc, "buy": buy, "rent": rent, "entry": entry,
                     "prize": prize, "champion": int(prize * 1.6), "model": "pocket", "icon": ""},
            "cars": [car_id],
            "calendar": build_calendar(rng),
        }
        ladder["nodes"].append(node)
        added.append(f"{node['display']} ({disc} L{level})")

    ladder.setdefault("_nota_espansione", "Coppa monomarca per ogni auto: access='open' senza requires/rep (access=0), "
                                          "id piste abbreviati ok per il matcher; generati da tools/expand-ladder.py")

    with open(LADDER, "w", encoding="utf-8") as fh:
        json.dump(ladder, fh, ensure_ascii=False, indent=1)

    print(f"aggiunte {len(added)} coppe, saltate (auto gia' usate) {len(skipped)}")
    for a in added:
        print("  +", a)
    print("backup:", os.path.relpath(backup, BASE))
    print("nodi totali:", len(ladder["nodes"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
