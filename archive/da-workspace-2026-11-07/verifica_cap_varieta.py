# -*- coding: utf-8 -*-
"""Post-fix: montaggio fedele ~87 shot. Verifica varieta (cap cartella) + semantica + anti-identici."""
import json, time, urllib.request, os, collections, re

BASE = "http://localhost:3000"
OUT = r"H:/Vitamed AI/.freebuff/test_cap_out"
SONG = "D:/Video musicale/EDDIE/Cavalco con i fantasmi/Cavalco con i Fantasmi.mp3"

def post(path, payload, timeout=30):
    req = urllib.request.Request(BASE + path, json.dumps(payload).encode("utf-8"), {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))

def get(path, timeout=30):
    with urllib.request.urlopen(BASE + path, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))

# Struttura simile a quella di "Chiamata a casa" (85+ shot, struttura completa)
d = post("/api/audio/parse-lyrics", {"content": """0:00 – Intro (Cavaliere che emerge dalle rovine, lento, notte)

0:39 – Verse 1 ("Hooves strike sparks on blackened dunes...")

0:59 – Chorus 1 ("I ride the edge of what was said and done...")

1:18 – Interlude / Riff Section (Riff di chitarra ritmico)

1:28 – Verse 2 ("Scorpions weave through rusted mail...")

1:48 – Chorus 2 ("I ride the edge of what was said and done...")

2:08 – Guitar Solo (Assolo di chitarra centrale virtuoso ed espressivo)

2:46 – Bridge ("They crowned me with a lie of light...")

3:06 – Chorus 3 ("I ride the edge of what was said and done...")

3:26 – Outro / Vocal Climax ("Cannot sleep...")

3:46 – Outro Riff (Chiusura con riff finale)

Testo Completo (Lyrics)
Verse 1
Hooves strike sparks on blackened dunes
My ribs are bars, my lungs are tombs
Chorus
I ride the edge of what was said and done
No grave will claim me, no sun
Bridge
They crowned me with a lie of light
Ride until the stars confess!
Outro
Cannot sleep...
"""})
sections = d["structure"]
print("sezioni:", len(sections))

job = post("/api/eddie/montage/start", {
    "songPath": SONG, "songName": "Cavalco con i fantasmi",
    "sections": sections, "outputDir": OUT, "mode": "fedele",
})
jid = job["job"]["id"]
t0 = time.time()
while time.time() - t0 < 600:
    j = get(f"/api/eddie/montage/status/{jid}").get("job", {})
    if j.get("status") in ("completed", "failed", "cancelled"):
        break
    time.sleep(6)
print("stato:", j.get("status"))
if j.get("status") != "completed":
    print("\n".join(j.get("logs", [])[-10:]))
    raise SystemExit(1)

plan = json.load(open(j["planPath"], encoding="utf-8"))
shots = plan["shots"]
folders = collections.Counter(s["folder"] for s in shots)
print("mode:", plan.get("mode"), "| shot:", len(shots))
print("cartelle distinte:", len(folders), "su", len(shots), "shot")
print("top 5 cartelle:", folders.most_common(5))
max_use = max(folders.values())
print(f"max uso singola cartella: {max_use} (cap=10) → {'OK' if max_use <= 10 else 'CAP NON RISPETTATO'}")

# semantica: assolo con chitarra
solo = [s for s in shots if "solo" in s["sec"].lower()]
g = sum(1 for s in solo if re.search(r"chitarr|guitar|suona|palco|assolo", os.path.basename(s.get("src", "")), re.I))
print(f"assolo: {len(solo)} shot, con chitarra nel nome: {g} (+match da prompt nel score)")

# anti-identici vs Chiamata a casa (storia)
h = json.load(open(r"H:/Metal Video generation auto/data/eddie-montage-history.json", encoding="utf-8"))
used = set(h.get("clips", []))
reused = sum(1 for s in shots if s.get("src") in used)
print(f"clip riusate dalla storia ({len(used)} note): {reused}/{len(shots)} (basso = memoria funziona)")
