import json, csv, os, hashlib, subprocess, re

FOLDER = r"D:\Video musicale\EDDIE\Acero Y Destino"
os.chdir(FOLDER)
d = json.load(open("manifest.json", encoding="utf-8"))
clips = d["clips"]

rows, problems = [], []
for c in clips:
    fn = c["new_filename"]
    exists = os.path.exists(fn)
    sha_disk = hashlib.sha256(open(fn, "rb").read()).hexdigest() if exists else ""
    sha_ok = (sha_disk == c["sha256"]) if exists else False
    prompt = c.get("prompt_inferred") or ""
    # garbage = il soggetto è letteralmente "Grok" + frammenti esadecimali dell'UUID del file
    garbage = bool(re.search(r"\bGrok\b(?=\s*[A-Fa-f0-9\s])", prompt))
    # template vuoto = nessun soggetto reale, solo la frase standard di Grok/AI Studio
    template = bool(re.search(r"Cinematic wide angle video shot\b", prompt)) and not re.search(
        r"warrior|skeleton|guitar|demon|knight|rider|colossus|king|crowd|stage|fire|rain", prompt, re.I)
    dur = w = h = ""
    if exists:
        try:
            j = json.loads(subprocess.run(
                ["ffprobe", "-v", "error", "-select_streams", "v:0",
                 "-show_entries", "stream=width,height", "-show_entries", "format=duration",
                 "-of", "json", fn], capture_output=True, text=True).stdout)
            w, h, dur = j["streams"][0]["width"], j["streams"][0]["height"], round(float(j["format"]["duration"]), 2)
        except Exception:
            pass
    if not exists:
        problems.append(f"MANCANTE: {fn}")
    if exists and not sha_ok:
        problems.append(f"SHA DIVERSA: {fn}")
    rows.append({
        "posizione": c["position"], "clip_id": c["clip_id"],
        "titolo": c["short_title"], "file_nuovo": fn,
        "file_originale_grok": c["original_filename"],
        "ruolo_narrativo": c.get("narrative_role", ""),
        "descrizione_IT": c.get("description", ""),
        "continuita": c.get("continuity_reason", ""),
        "confidence": c.get("confidence", ""),
        "prompt_EN": prompt,
        "flag_prompt_16x9": "SI" if "16:9" in prompt else "",
        "flag_prompt_uuid_garbage": "SI" if garbage else "",
        "flag_prompt_template_vuoto": "SI" if template else "",
        "durata_s": dur, "risoluzione": f"{w}x{h}" if w else "",
        "sha256": c["sha256"], "sha_verificata_su_disco": "SI" if sha_ok else "NO",
        "metadata_embedded": "SI" if c.get("metadata_embedded") else "NO",
    })

rows.sort(key=lambda r: r["posizione"])
cols = list(rows[0].keys())
with open("MAPEGGIO_TITOLI_PROMPT.csv", "w", newline="", encoding="utf-8-sig") as f:
    wr = csv.DictWriter(f, fieldnames=cols, delimiter=";")
    wr.writeheader()
    wr.writerows(rows)

json.dump({"saga": d["project_name"], "generato": d["export_timestamp"],
           "modello": d["settings"]["gemini_model"], "totale_clip": len(rows), "clip": rows},
          open("MAPEGGIO_TITOLI_PROMPT.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)

print(f"RIGHE: {len(rows)}  (attese {d['clips_count']})")
print("su disco+sha ok:", sum(1 for r in rows if r["sha_verificata_su_disco"] == "SI"))
print("prompt 16:9:", sum(1 for r in rows if r["flag_prompt_16x9"]))
print("prompt UUID-garbage:", sum(1 for r in rows if r["flag_prompt_uuid_garbage"]),
      "->", [r["posizione"] for r in rows if r["flag_prompt_uuid_garbage"]])
print("prompt template-vuoto:", sum(1 for r in rows if r["flag_prompt_template_vuoto"]),
      "->", [r["posizione"] for r in rows if r["flag_prompt_template_vuoto"]])
conf = [r["confidence"] for r in rows if isinstance(r["confidence"], (int, float))]
print(f"confidence media: {sum(conf)/len(conf):.2f}  min: {min(conf):.2f}")
from collections import Counter
print("ruoli:", dict(Counter(r["ruolo_narrativo"] for r in rows)))
print("metadata_embedded:", Counter(r["metadata_embedded"] for r in rows))
print("PROBLEMI:", problems if problems else "NESSUNO")
