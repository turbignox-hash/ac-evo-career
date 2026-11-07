# -*- coding: utf-8 -*-
"""Parte 2: copertura recupero prompt per cartella (vault vs disco) su tutto EDDIE."""
import json, re, os, collections

CAT = r"H:/Metal Video generation auto/data/vault-catalog.json"
EDDIE = r"D:/Video musicale/EDDIE"

cur = json.load(open(CAT, encoding="utf-8"))["assets"]

def folder_of(a):
    m = re.search(r"EDDIE\\+([^\\]+)\\", str(a.get("filePath", "")))
    return m.group(1) if m else None

def norm(s):
    return re.sub(r"\s+", " ", str(s or "")).strip()

by_folder = collections.defaultdict(lambda: {"tot": 0, "tpl": 0, "vuoto": 0, "altro": 0})
for a in cur:
    if a.get("fileType") != "video":
        continue
    f = folder_of(a)
    if not f:
        continue
    d = by_folder[f]
    d["tot"] += 1
    p = norm(a.get("prompt"))
    if not p:
        d["vuoto"] += 1
    elif p.startswith("Cinematic 4k heavy metal masterpiece"):
        d["tpl"] += 1
    else:
        d["altro"] += 1

# copertura disco: prompts.txt / manifest.json / rename_log.csv per cartella
def disk_info(fold):
    base = os.path.join(EDDIE, fold)
    info = []
    pt = os.path.join(base, "prompts.txt")
    if os.path.exists(pt):
        t = open(pt, encoding="utf-8", errors="replace").read()
        types = collections.Counter(re.findall(r"Tipo prompt:\s*(\S+)", t))
        n = sum(types.values())
        info.append("prompts.txt(%d: %s)" % (n, ",".join("%s=%d" % kv for kv in types.most_common())))
    for fn in ("manifest.json", "manifest.csv", "PROMPTS_SAGA.txt", "rename_log.csv"):
        if os.path.exists(os.path.join(base, fn)):
            info.append(fn)
    return info

print("%-42s | %5s %5s %5s | RECUPERO DISCO" % ("CARTELLA", "vid", "tpl", "vuoti"))
print("-" * 130)
folders = sorted(by_folder.keys())
for f in folders:
    d = by_folder[f]
    di = disk_info(f)
    mark = "OK: " + "; ".join(di) if di else "--- NESSUN FILE VSO ---"
    print("%-42s | %5d %5d %5d | %s" % (f[:42], d["tot"], d["tpl"], d["vuoto"], mark))

print("\nTOTALE cartelle con video: %d | video: %d | templated: %d | vuoti: %d"
      % (len(folders), sum(d["tot"] for d in by_folder.values()),
         sum(d["tpl"] for d in by_folder.values()), sum(d["vuoto"] for d in by_folder.values())))
rec = [f for f in folders if disk_info(f)]
print("cartelle con almeno un file VSO di recupero su disco: %d" % len(rec))
print("cartelle con prompts.txt (prompt completi recuperabili): %d" %
      sum(1 for f in folders if os.path.exists(os.path.join(EDDIE, f, "prompts.txt"))))
