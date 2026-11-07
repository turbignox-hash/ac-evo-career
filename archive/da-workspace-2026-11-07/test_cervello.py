# -*- coding: utf-8 -*-
"""Test del cervello semantico Eddie: parse struttura + 2 mini-montaggi."""
import json, time, urllib.request, os

BASE = "http://localhost:3000"
OUT = r"H:/Vitamed AI/.freebuff/test_montaggio_oss"
SONG = "D:/Video musicale/EDDIE/Cavalco con i fantasmi/Cavalco con i Fantasmi.mp3"

def post(path, payload, timeout=30):
    req = urllib.request.Request(BASE + path, json.dumps(payload).encode("utf-8"),
                                 {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))

def get(path, timeout=30):
    with urllib.request.urlopen(BASE + path, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))

STRUTTURA = """0:00 – Intro (Inizio con assolo di chitarra elettrica in stile power/thrash metal, seguito dalla ritmica serrata)

0:39 – Verse 1 ("Hooves strike sparks on blackened dunes...")

0:59 – Chorus 1 ("I ride the edge of what was said and done...")

1:18 – Interlude / Riff Section (Riff di chitarra ritmico)

1:28 – Verse 2 ("Scorpions weave through rusted mail...")

1:48 – Chorus 2 ("I ride the edge of what was said and done...")

2:08 – Guitar Solo (Assolo di chitarra centrale virtuoso ed espressivo)

2:46 – Bridge ("They crowned me with a lie of light...")

3:06 – Chorus 3 ("I ride the edge of what was said and done...")

3:26 – Outro / Vocal Climax ("Cannot sleep...")

3:46 – Outro Riff (Chiusura con riff di chitarra finale fino a 4:18)

Testo Completo (Lyrics)

Verse 1
Hooves strike sparks on blackened dunes
My ribs are bars, my lungs are tombs
The wind howls names I used to own
Now carved in stone, now turned to bone

Chorus
I ride the edge of what was said and done
No grave will claim me, no sun
The saddle burns with every mile I keep
A king who cannot die, a soul that cannot sleep

Outro
Cannot sleep...
Cannot sleep...
"""

# ---------- 1. parse struttura ----------
d = post("/api/audio/parse-lyrics", {"content": STRUTTURA})
st = d.get("structure")
print("=== 1. STRUTTURA RICONOSCIUTA ===")
print("lyrics versi:", len(d.get("lyrics", [])))
if not st:
    print("!! struttura NON riconosciuta"); raise SystemExit(1)
for s in st:
    print(f"  {s['name']:26s} {s['start']:>4.0f}-{s['end']:<4.0f} shots={s['shots']:<3} lyric: {s['lyric'][:60]}")

# ---------- 2. mini-montaggio (solo 3 sezioni x 2 shot) ----------
mini = [dict(s, start=s["start"], end=s["start"] + 8, shots=2) for s in st if s["name"].lower().startswith(("intro", "guitarsolo", "chorus"))][:3]
print("\n=== 2. MONTAGGIO 1 (6 shot) ===")
job = post("/api/eddie/montage/start", {
    "songPath": SONG,
    "songName": "Cavalco con i fantasmi",
    "sections": mini,
    "outputDir": OUT,
})
jid = job["job"]["id"]
print("job:", jid)

def wait(job_id, max_s=420):
    t0 = time.time()
    while time.time() - t0 < max_s:
        j = get(f"/api/eddie/montage/status/{job_id}").get("job", {})
        if j["status"] in ("completed", "failed", "cancelled"):
            return j
        time.sleep(5)
    raise TimeoutError("montaggio troppo lento")

j1 = wait(jid)
print("stato:", j1["status"], "|", (j1.get("error") or j1.get("outputPath") or "")[:100])
if j1["status"] != "completed":
    print("\n".join(j1["logs"][-12:]))
    raise SystemExit(1)

plan1 = json.load(open(j1["planPath"], encoding="utf-8"))
print("\n--- piano 1 ---")
for s in plan1["shots"]:
    print(f"  [{s['sec']:16s}] score={s.get('score')} folder={s['folder'][:30]:32s} src={os.path.basename(s.get('src','?'))[:60]}")

# ---------- 3. secondo montaggio: DEVE differire ----------
print("\n=== 3. MONTAGGIO 2 (stesse sezioni: deve essere DIVERSO) ===")
job2 = post("/api/eddie/montage/start", {
    "songPath": SONG,
    "songName": "Cavalco con i fantasmi",
    "sections": mini,
    "outputDir": OUT,
})
j2 = wait(job2["job"]["id"])
print("stato:", j2["status"])
if j2["status"] != "completed":
    print("\n".join(j2["logs"][-12:]))
    raise SystemExit(1)

plan2 = json.load(open(j2["planPath"], encoding="utf-8"))
same = sum(1 for a, b in zip(plan1["shots"], plan2["shots"]) if a.get("src") == b.get("src"))
print(f"\nclip identiche stessa posizione tra montaggio 1 e 2: {same}/{min(len(plan1['shots']), len(plan2['shots']))}")
hist = os.path.exists(r"H:/Metal Video generation auto/data/eddie-montage-history.json")
print("storia montaggi creata:", hist)
if hist:
    h = json.load(open(r"H:/Metal Video generation auto/data/eddie-montage-history.json", encoding="utf-8"))
    print("montaggi in storia:", len(h.get("montages", [])), "| clip totali:", len(h.get("clips", [])))
print("output:", OUT)
