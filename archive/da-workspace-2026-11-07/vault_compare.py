# -*- coding: utf-8 -*-
"""Confronto vault VSO (catalogo attuale + backup) vs file txt/json/csv su disco (prime 12 cartelle EDDIE)."""
import json, re, os, collections

CAT = r"H:/Metal Video generation auto/data/vault-catalog.json"
BAK = r"H:/Metal Video generation auto/data/vault-catalog.backup-234437.json"
EDDIE = r"D:/Video musicale/EDDIE"

FOLDERS12 = [
    "Acero Y Destino", "Atomic Wasteland", "Awakening of the Pharaoh",
    "Battaglia sotto il cielo di sangue", "Blood not bone", "Break the Prophecy",
    "Burn the name", "Buuuzzu fuoco e acciaio", "Canto del  deserto",
    "Canto dell eternità - Eternal Song", "Carica nel tuono", "Cavalca dove il cielo",
]

def load(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)

cur = load(CAT)["assets"]
bak = {a["id"]: a for a in load(BAK)["assets"]}
print("Vault attuale: %d asset (salvato %s) | backup: %d asset" % (len(cur), load(CAT).get("savedAt"), len(bak)))

def folder_of(a):
    m = re.search(r"EDDIE\\+([^\\]+)\\", str(a.get("filePath", "")))
    return m.group(1) if m else None

def norm(s):
    return re.sub(r"\s+", " ", str(s or "")).strip()

# ---------- A. STATO VAULT PER LE 12 CARTELLE ----------
print("\n" + "=" * 100)
print("A. VAULT ATTUALE - video per le prime 12 cartelle: prompt distinti")
print("=" * 100)
for fold in FOLDERS12:
    vids = [a for a in cur if folder_of(a) == fold and a.get("fileType") == "video"]
    prompts = collections.Counter(norm(a.get("prompt")) for a in vids)
    generic = sum(n for p, n in prompts.items() if p.startswith("Cinematic 4k heavy metal masterpiece"))
    print("\n[%s] video=%d | prompt NON vuoti=%d | distinti=%d | template 'Cinematic 4k'=%d"
          % (fold, len(vids), sum(n for p, n in prompts.items() if p), len(prompts), generic))
    for p, n in prompts.most_common(4):
        if p:
            print("   x%-3d %s" % (n, p[:105]))

# ---------- B. BACKUP (23:44) vs ATTUALE: prompt/titoli cambiati ----------
print("\n" + "=" * 100)
print("B. BACKUP vs VAULT ATTUALE - cosa e' cambiato (solo prime 12 cartelle, video)")
print("=" * 100)
tot_same = tot_pchg = tot_tchg = 0
examples = []
for fold in FOLDERS12:
    vids = [a for a in cur if folder_of(a) == fold and a.get("fileType") == "video"]
    for a in vids:
        b = bak.get(a["id"])
        if not b:
            continue
        tot_same += 1
        po, pn = norm(b.get("prompt")), norm(a.get("prompt"))
        to, tn = norm(b.get("title")), norm(a.get("title"))
        if po != pn:
            tot_pchg += 1
        if to != tn:
            tot_tchg += 1
        if po != pn and len(examples) < 3:
            examples.append((fold, norm(a.get("originalFileName")), po[:90], pn[:90]))
print("confrontati=%d | prompt cambiati=%d | titoli cambiati=%d" % (tot_same, tot_pchg, tot_tchg))
for e in examples:
    print("  ESEMPIO [%s] %s\n    PRIMA: %s\n    DOPO : %s" % e)

# ---------- C. VAULT vs DISCO: prompts.txt delle cartelle VSO ----------
print("\n" + "=" * 100)
print("C. VAULT vs FILE SU DISCO (prompts.txt) - cartelle con artefatti VSO nelle prime 12")
print("=" * 100)

def parse_prompts_txt(path):
    """ritorna dict file_nuovo -> prompt dal blocks file."""
    out = {}
    if not os.path.exists(path):
        return out
    with open(path, encoding="utf-8", errors="replace") as f:
        txt = f.read()
    for block in txt.split("=" * 50):
        m1 = re.search(r"File nuovo:\s*(.+)", block)
        m2 = re.search(r"Prompt:\s*\n(.+)", block, re.S)
        if m1 and m2:
            out[m1.group(1).strip()] = norm(m2.group(1))
    return out

VSO_FOLDERS = ["Acero Y Destino", "Atomic Wasteland", "Canto dell eternità - Eternal Song",
               "Carica nel tuono", "Cavalca dove il cielo"]
for fold in VSO_FOLDERS:
    disk = parse_prompts_txt(os.path.join(EDDIE, fold, "prompts.txt"))
    vids = {norm(a.get("originalFileName")): a for a in cur
            if folder_of(a) == fold and a.get("fileType") == "video"}
    common = set(disk) & set(vids)
    same = diff = 0
    ex = None
    for fn in sorted(common):
        if norm(vids[fn].get("prompt")) == disk[fn]:
            same += 1
        else:
            diff += 1
            if ex is None:
                ex = (fn, disk[fn][:95], norm(vids[fn].get("prompt"))[:95])
    print("\n[%s] dischi(vault comuni)=%d | prompt UGUALI=%d | DIVERSI=%d"
          % (fold, len(common), same, diff))
    if ex:
        print("   es. %s\n     DISCO: %s\n     VAULT: %s" % ex)

# ---------- D. QUANTITa' GLOBALE: quanti prompt template nel vault ----------
print("\n" + "=" * 100)
print("D. VAULT INTERO EDDIE - panoramica prompt video")
print("=" * 100)
allv = [a for a in cur if folder_of(a) and a.get("fileType") == "video"]
cnt = collections.Counter()
for a in allv:
    p = norm(a.get("prompt"))
    cnt["template 'Cinematic 4k heavy metal masterpiece...'"] += 1 if p.startswith("Cinematic 4k heavy metal masterpiece") else 0
    cnt["vuoto"] += 1 if not p else 0
    cnt["altro/originale"] += 1 if p and not p.startswith("Cinematic 4k heavy metal masterpiece") else 0
print("video totali nel vault: %d" % len(allv))
for k, v in cnt.most_common():
    print("   %-55s %d" % (k, v))
print("distinti prompt 'Cinematic 4k...' in tutto il vault: %d" %
      len({norm(a.get("prompt")) for a in allv if norm(a.get("prompt")).startswith("Cinematic 4k heavy metal masterpiece")}))
