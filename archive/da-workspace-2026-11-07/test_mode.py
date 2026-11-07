# -*- coding: utf-8 -*-
"""Verifica che il selettore fedele/misto/random sia rispettato dal motore."""
import json, time, urllib.request, os

BASE = "http://localhost:3000"
OUT = r"H:/Vitamed AI/.freebuff/test_mode_out"
SONG = "D:/Video musicale/EDDIE/Cavalco con i fantasmi/Cavalco con i Fantasmi.mp3"

def post(path, payload, timeout=30):
    req = urllib.request.Request(BASE + path, json.dumps(payload).encode("utf-8"),
                                 {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))

def get(path, timeout=30):
    with urllib.request.urlopen(BASE + path, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))

SECTIONS = [
    {"name": "Intro1", "start": 0, "end": 8, "shots": 3, "folders": [],
     "lyric": "Inizio con cavaliere che emerge dalle rovine, cammina lento tra le tombe, notte e silenzio"},
    {"name": "GuitarSolo1", "start": 8, "end": 16, "shots": 3, "folders": [],
     "lyric": "Assolo di chitarra centrale virtuoso ed espressivo, Eddie suona la chitarra elettrica sul palco"},
    {"name": "Outro1", "start": 16, "end": 24, "shots": 3, "folders": [],
     "lyric": "Cannot sleep, chiusura calma con il cavaliere che si allontana all'alba"},
]

def run(mode):
    job = post("/api/eddie/montage/start", {
        "songPath": SONG, "songName": "Cavalco con i fantasmi",
        "sections": [dict(s) for s in SECTIONS], "outputDir": OUT, "mode": mode,
    })
    jid = job["job"]["id"]
    t0 = time.time()
    while time.time() - t0 < 420:
        j = get(f"/api/eddie/montage/status/{jid}").get("job", {})
        if j.get("status") in ("completed", "failed", "cancelled"):
            break
        time.sleep(5)
    if j.get("status") != "completed":
        print(mode, "STATO:", j.get("status"), j.get("error"))
        print("\n".join(j.get("logs", [])[-8:]))
        return None
    plan = json.load(open(j["planPath"], encoding="utf-8"))
    return plan

results = {}
for mode in ("fedele", "misto", "random"):
    plan = run(mode)
    if not plan:
        raise SystemExit(1)
    scores = [s.get("score", 0) for s in plan["shots"]]
    srcs = [os.path.basename(s.get("src", "")) for s in plan["shots"]]
    results[mode] = (scores, srcs)
    print(f"\n=== MODE={mode} | mode nel piano: {plan.get('mode')} ===")
    for s in plan["shots"]:
        print(f"  [{s['sec']:12s}] score={s.get('score'):>6} | {os.path.basename(s.get('src','?'))[:64]}")
    print(f"  punteggio MEDIO: {sum(scores)/len(scores):.1f} | max: {max(scores):.1f}")

# VERIFICHE DEL RISPETTO DEL SELETTORE
# La metrica giusta NON sono i punteggi grezzi (il rumore e' scalato per modalita'),
# ma la QUALITA' SEMANTICA delle scelte dentro ogni modalita'.
GUITAR = ("chitarr", "guitar", "rituale", "palco", "assolo")
CALM = ("emerg", "cammin", "silenz", "valley", "risvegli", "lento", "alba")

def semantic_hits(srcs, words):
    return sum(1 for s in srcs if any(w in s.lower() for w in words))

h_f = semantic_hits(results["fedele"][1][:3], CALM)
h_m = semantic_hits(results["misto"][1][:3], CALM)
h_r = semantic_hits(results["random"][1][:3], CALM)
print("\n=== VERIFICA SELETTORE (qualita' semantica delle scelte) ===")
print(f"1) intro CALME: fedele {h_f}/3 · misto {h_m}/3 · random {h_r}/3")

g_f = semantic_hits(results["fedele"][1][3:], GUITAR)
g_m = semantic_hits(results["misto"][1][3:], GUITAR)
g_r = semantic_hits(results["random"][1][3:], GUITAR)
print(f"2) assolo con CHITARRA: fedele {g_f}/3 · misto {g_m}/3 · random {g_r}/3")
ok_sem = (g_f >= g_r) and (h_f >= h_r)
print(f"   → semantica fedele >= random: {'OK' if ok_sem else 'FALLITO'}")

# fedele = quasi deterministico: 2 run consecutivi devono coincidere quasi sempre
plan_fb = run("fedele")
if plan_fb:
    srcs_fb = [os.path.basename(s.get("src", "")) for s in plan_fb["shots"]]
    same_fb = sum(1 for a, b in zip(results["fedele"][1], srcs_fb) if a == b)
    print(f"3) fedele riproducibile (2 run): {same_fb}/9 clip uguali (attese >=6)")

# random = pesca libera: 2 run devono differire molto
plan_rb = run("random")
if plan_rb:
    srcs_rb = [os.path.basename(s.get("src", "")) for s in plan_rb["shots"]]
    same_rb = sum(1 for a, b in zip(results["random"][1], srcs_rb) if a == b)
    print(f"4) random varia (2 run): {same_rb}/9 clip uguali (attese <=3)")

plans_all_distinct = len({tuple(v[1]) for v in results.values()}) >= 2
print(f"5) sequenze distinte per modalita': {'OK' if plans_all_distinct else 'FALLITO'}")
