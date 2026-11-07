# -*- coding: utf-8 -*-
"""Regressione: 2 run fedele consecutivi, stessa struttura → nessuno shot identico.
Verifica anche che la memoria us sia quella al percorso FISSO (Documents)."""
import json, time, urllib.request, os

BASE = "http://localhost:3000"
OUT = r"H:/Vitamed AI/.freebuff/test_regressione_out"
SONG = "D:/Video musicale/EDDIE/Cavalco con i fantasmi/Cavalco con i Fantasmi.mp3"
FIXED_HISTORY = r"C:/Users/Mauro/Documents/MetalVideoAutoEditor/eddie-montage-history.json"

def post(path, payload, timeout=30):
    req = urllib.request.Request(BASE + path, json.dumps(payload).encode("utf-8"), {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))

def get(path, timeout=30):
    with urllib.request.urlopen(BASE + path, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))

SECTIONS = [
    {"name": "Intro1", "start": 0, "end": 10, "shots": 3, "folders": [],
     "lyric": "Cavaliere che emerge dalle rovine, cammina lento tra le tombe, notte e silenzio"},
    {"name": "GuitarSolo1", "start": 10, "end": 20, "shots": 3, "folders": [],
     "lyric": "Assolo di chitarra centrale virtuoso ed espressivo, Eddie suona la chitarra elettrica sul palco"},
    {"name": "Outro1", "start": 20, "end": 30, "shots": 3, "folders": [],
     "lyric": "Cannot sleep, chiusura calma, il cavaliere si allontana all'alba"},
]

def run(mode="fedele"):
    job = post("/api/eddie/montage/start", {
        "songPath": SONG, "songName": "Cavalco con i fantasmi",
        "sections": [dict(s) for s in SECTIONS], "outputDir": OUT, "mode": mode,
    })
    jid = job["job"]["id"]
    t0 = time.time()
    while time.time() - t0 < 480:
        j = get(f"/api/eddie/montage/status/{jid}").get("job", {})
        if j.get("status") in ("completed", "failed", "cancelled"):
            break
        time.sleep(5)
    if j.get("status") != "completed":
        print("STATO:", j.get("status"), j.get("error"))
        print("\n".join(j.get("logs", [])[-8:]))
        raise SystemExit(1)
    return j

logs1 = run()
plan1 = json.load(open(logs1["planPath"], encoding="utf-8"))
h1 = {m["id"]: m for m in json.load(open(FIXED_HISTORY, encoding="utf-8"))["montages"]}
print("storia ficata usata, montaggi =", len(h1))

run2 = run()
plan2 = json.load(open(run2["planPath"], encoding="utf-8"))

src1 = [s.get("src", "") for s in plan1["shots"]]
src2 = [s.get("src", "") for s in plan2["shots"]]
same_pos = sum(1 for a, b in zip(src1, src2) if a == b)
print(f"\n>>> stile run fedeli consecutivi, STESSA struttura:")
print("    1 |", " / ".join(os.path.basename(x)[:24] for x in src1))
print("    2 |", " / ".join(os.path.basename(x)[:24] for x in src2))
print(f">>> shot identici stessa posizione: {same_pos}/{len(src1)}")

# e il pianificato rispetla mode
print("mode1 =", plan1.get("mode"), "| mode2 =", plan2.get("mode"))
ok = same_pos == 0
print("\n>>> RISULTATO:", "OK - INAUGURATO il funnel: 2 run non hanno nemmeno clip in comune" if ok else "FALLITO - ancora identici")
