# -*- coding: utf-8 -*-
"""Test mirato semantica: assolo→chitarra, intro→calma. Ultima sezione = esca (allungata)."""
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

# Chorus1 è ULTIMO → verrà allungato sull'audio reale e scartato (artefatto voluto del test).
# Intro1 e GuitarSolo1 sono contigue → verranno pianificate davvero.
SECTIONS = [
    {"name": "Intro1",      "start": 0,  "end": 8,  "shots": 2, "folders": [],
     "lyric": "Inizio con cavaliere che emerge dalle rovine, cammina lento tra le tombe, notte e silenzio"},
    {"name": "GuitarSolo1", "start": 8,  "end": 16, "shots": 2, "folders": [],
     "lyric": "Assolo di chitarra centrale virtuoso ed espressivo, Eddie suona la chitarra elettrica sul palco"},
    {"name": "Chorus1",     "start": 16, "end": 24, "shots": 2, "folders": [],
     "lyric": "I ride the edge of what was said and done, the saddle burns with every mile"},
]

job = post("/api/eddie/montage/start", {
    "songPath": SONG, "songName": "Cavalco con i fantasmi",
    "sections": SECTIONS, "outputDir": OUT,
})
jid = job["job"]["id"]
t0 = time.time()
while time.time() - t0 < 420:
    j = get(f"/api/eddie/montage/status/{jid}").get("job", {})
    if j.get("status") in ("completed", "failed", "cancelled"):
        break
    time.sleep(5)
print("stato:", j.get("status"))
if j.get("status") != "completed":
    print("\n".join(j.get("logs", [])[-15:]))
    raise SystemExit(1)

plan = json.load(open(j["planPath"], encoding="utf-8"))
print("\n--- SCelte del cervello semantico ---")
for s in plan["shots"]:
    print(f"  [{s['sec']:12s}] score={s.get('score'):>5} | {os.path.basename(s.get('src','?'))[:70]}")

guitar_ok = all(("chitarr" in s.get("src", "").lower() or "guitar" in s.get("src", "").lower()
                 or "suona" in s.get("src", "").lower()) for s in plan["shots"] if s["sec"].startswith("GuitarSolo"))
print("\nassolo con clip di chitarra:", "SÌ ✓" if guitar_ok else "NO — guarda i punteggi")
