# -*- coding: utf-8 -*-
"""
SCANSIONE MANUALE del vault del Video Saga Organizer (H:/Metal Video generation auto).

Cosa fa, in ordine:
  1. Controlla che l'app VSO sia CHIUSA (porte 3000-3019) — mai toccare il catalogo a app aperta.
  2. SCANSIONE RINOMINE: confronta i video su disco (D:\\Video musicale\\EDDIE e sottocartelle)
     con gli asset del vault. Se un file e' stato RINOMINATO a mano (es. da nomi grok/UUID a
     "clip xx - titolo.mp4"), aggiorna nel vault: filePath, originalPath, renamedFileName,
     isRenamed=true. Abbinamento per DIMENSIONE IN BYTE nella stessa cartella (+ durata ffprobe
     solo in caso di ambiguita'). Le vecchie denominazioni restano in originalFileName (provenance)
     e nella mappa sidecar vault_rename_map.json.
  3. IMPORT PROMPT: legge i prompts.txt delle sottocartelle e scrive il prompt VERO nel campo
     prompt dell'asset. Abbinamento: nome attuale -> File originale (grok) -> mappa rinomine.
  4. Backup del catalogo PRIMA di scrivere + scrittura atomica (solo se c'e' qualcosa da cambiare).
  5. Verifica completa post-scrittura (percorsi esistenti + prompt uguali al disco) + campione.

RI-ESEGUIBILE: aggiungi prompt o rinomini clip nelle sottocartelle -> chiudi l'app ->
python vault_importa_prompt.py  (importa automaticamente i cambiamenti).

ATTENZIONE: lancia lo script a rinomine finite, non mentre rinomini.
"""
import datetime
import json
import os
import random
import re
import shutil
import socket
import subprocess
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

CAT = os.environ.get("VSO_CAT", r"H:/Metal Video generation auto/data/vault-catalog.json")
EDDIE = os.environ.get("VSO_EDDIE", r"D:/Video musicale/EDDIE")
RENAME_MAP_PATH = os.environ.get("VSO_RENAMEMAP", r"H:/Vitamed AI/.freebuff/vault_rename_map.json")
VIDEO_EXT = {".mp4", ".mov", ".webm", ".mkv"}


def norm(s):
    return re.sub(r"\s+", " ", str(s or "")).strip()


def squash(s):
    return re.sub(r"\s+", " ", str(s or "")).strip().lower()


def folder_of(a):
    m = re.search(r"EDDIE\\+([^\\]+)\\", str(a.get("filePath", "")))
    return m.group(1) if m else None


def probe_duration(path):
    ff = shutil.which("ffprobe")
    if not ff:
        return None
    try:
        out = subprocess.run(
            [ff, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
            capture_output=True, text=True, timeout=20).stdout.strip()
        return float(out) if out else None
    except Exception:
        return None


# ---------------------------------------------------------------- 0. app chiusa
for port in range(3000, 3020):
    with socket.socket() as s:
        s.settimeout(0.2)
        if s.connect_ex(("127.0.0.1", port)) == 0:
            print(f"STOP: porta {port} attiva — l'app VSO sembra APERTA. Chiudila e rilancia.")
            sys.exit(2)
print("OK: app VSO chiusa (nessun server sulle porte 3000-3019)")

# ---------------------------------------------------------------- 1. catalogo + mappa rinomine
with open(CAT, encoding="utf-8") as f:
    cat = json.load(f)
assets = cat["assets"]
print(f"Catalogo caricato: {len(assets)} asset (savedAt {cat.get('savedAt')})")

rename_map = {}
if os.path.exists(RENAME_MAP_PATH):
    with open(RENAME_MAP_PATH, encoding="utf-8") as f:
        rename_map = json.load(f)

# ---------------------------------------------------------------- 2. inventario disco
disk = {}  # folder -> {nome_lower: (nome, size)}
for name in sorted(os.listdir(EDDIE)):
    base = os.path.join(EDDIE, name)
    if not os.path.isdir(base):
        continue
    inv = {}
    for f in os.listdir(base):
        p = os.path.join(base, f)
        if os.path.isfile(p) and os.path.splitext(f)[1].lower() in VIDEO_EXT:
            try:
                inv[f.lower()] = (f, os.path.getsize(p))
            except OSError:
                pass
    disk[name] = inv

videos = [a for a in assets if a.get("fileType") == "video" and folder_of(a)]
print(f"Video nel vault in sottocartelle EDDIE: {len(videos)} | cartelle disco con video: "
      f"{sum(1 for inv in disk.values() if inv)}")

# ---------------------------------------------------------------- 3. sincronizzazione rinomine
claimed = set()          # (folder_lower, file_lower) occupati da asset con percorso esistente
renames, ambiguous, missing = [], [], []

for fold, inv in disk.items():
    for a in videos:
        if folder_of(a) != fold:
            continue
        bp = os.path.basename(str(a.get("filePath", "")))
        if bp.lower() in inv:
            claimed.add((fold.lower(), bp.lower()))

for fold, inv in disk.items():
    fl = fold.lower()
    for a in videos:
        if folder_of(a) != fold:
            continue
        bp = os.path.basename(str(a.get("filePath", "")))
        if bp.lower() in inv:
            # esiste gia': allinea i campi nome se diversi
            if a.get("renamedFileName") != bp:
                a["renamedFileName"] = bp
            continue
        size = a.get("fileSizeBytes")
        cands = sorted(v[0] for k, v in inv.items()
                       if v[1] == size and (fl, k) not in claimed)
        if len(cands) > 1:
            dur = a.get("duration")
            if dur:
                strict = [c for c in cands
                          if (d := probe_duration(os.path.join(EDDIE, fold, c))) is not None
                          and abs(d - float(dur)) <= 0.15]
                if len(strict) == 1:
                    cands = strict
        if len(cands) == 1:
            newname = cands[0]
            a["filePath"] = os.path.join(EDDIE, fold, newname)
            a["originalPath"] = f"{fold}\\{newname}"
            a["renamedFileName"] = newname
            a["isRenamed"] = True
            claimed.add((fl, newname.lower()))
            rename_map.setdefault(fold, {})[bp] = newname
            renames.append((fold, bp, newname))
        elif len(cands) > 1:
            ambiguous.append(f"{fold}: {bp} ({size} byte -> {len(cands)} candidati)")
        else:
            missing.append(f"{fold}: {bp}")

# file su disco non rivendicati da nessun asset
unclaimed = []
for fold, inv in disk.items():
    fl = fold.lower()
    for k, (name, size) in inv.items():
        if (fl, k) not in claimed:
            unclaimed.append(f"{fold}\\{name} ({size} byte)")

print(f"\nRINOMINE: aggiornate={len(renames)} ambigue={len(ambiguous)} mancanti_sul_disco={len(missing)}")
for r in renames[:10]:
    print(f"   {r[0]}: {r[1]}  ->  {r[2]}")
if len(renames) > 10:
    print(f"   ... e altre {len(renames) - 10}")
for x in (ambiguous + missing)[:8]:
    print("   ?", x)
print(f"File video su disco non registrati nel vault: {len(unclaimed)} (es. montaggi)")
for u in unclaimed[:8]:
    print("   +", u)

with open(RENAME_MAP_PATH, "w", encoding="utf-8") as f:
    json.dump(rename_map, f, ensure_ascii=False, indent=1)

# ---------------------------------------------------------------- 4. import prompt dai prompts.txt
keymap = {}
for a in videos:
    fold = folder_of(a)
    names = {a.get("originalFileName"), a.get("renamedFileName"),
             os.path.basename(str(a.get("filePath", "")))}
    for n in names:
        if n:
            keymap.setdefault((squash(fold), squash(n)), a)


def parse_prompts_txt(path):
    """Ritorna [(file_nuovo, file_originale|None, prompt)] dai blocchi export VSO."""
    out = []
    with open(path, encoding="utf-8", errors="replace") as f:
        txt = f.read()
    for block in txt.split("=" * 50):
        m1 = re.search(r"File nuovo:\s*(.+)", block)
        m2 = re.search(r"File originale:\s*(.+)", block)
        m3 = re.search(r"Prompt:\s*\n(.+)", block, re.S)
        if m1 and m3 and norm(m3.group(1)):
            out.append((m1.group(1).strip(),
                        m2.group(1).strip() if m2 else None,
                        norm(m3.group(1))))
    return out


def find_asset(fold, fn, fo):
    fl, fln = squash(fold), squash(fn)
    a = keymap.get((fl, fln))
    if a is None and fln in rename_map.get(fold, {}):
        a = keymap.get((fl, squash(rename_map[fold][fln])))
    if a is None and fo:
        a = keymap.get((fl, squash(fo)))
    return a


tot_blk = tot_upd = tot_eq = tot_miss = 0
prompt_unmatched = []
for fold, inv in disk.items():
    pt = os.path.join(EDDIE, fold, "prompts.txt")
    if not os.path.exists(pt):
        continue
    blocks = parse_prompts_txt(pt)
    if not blocks:
        continue
    upd = eq = miss = 0
    for fn, fo, prompt in blocks:
        a = find_asset(fold, fn, fo)
        if a is None:
            miss += 1
            prompt_unmatched.append(f"{fold} -> {fn}")
            continue
        if norm(a.get("prompt")) == prompt:
            eq += 1
        else:
            a["prompt"] = prompt
            upd += 1
    tot_blk += len(blocks)
    tot_upd += upd
    tot_eq += eq
    tot_miss += miss
    print(f"[PROMPT] [{fold}] blocchi={len(blocks)} aggiornati={upd} gia_uguali={eq} non_trovati={miss}")

print(f"\nPROMPT: blocchi={tot_blk} aggiornati={tot_upd} gia_uguali={tot_eq} non_trovati={tot_miss}")
for u in prompt_unmatched[:5]:
    print("   -", u)

if tot_upd == 0 and not renames:
    print("\nNessun cambiamento: vault gia allineato al disco (prompt + nomi file). Scrittura non necessaria.")
    sys.exit(0)

# ---------------------------------------------------------------- 5. backup + scrittura atomica
ts = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
bak = CAT + f".pre-import-{ts}.json"
shutil.copy2(CAT, bak)
print(f"\nBackup pre-scrittura: {bak}")

cat["savedAt"] = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
tmp = CAT + ".tmp"
with open(tmp, "w", encoding="utf-8", newline="\n") as f:
    json.dump(cat, f, ensure_ascii=False, separators=(",", ": "))
os.replace(tmp, CAT)
print(f"Scritto: {CAT} ({os.path.getsize(CAT)} byte)")

# ---------------------------------------------------------------- 6. verifica completa + campione
with open(CAT, encoding="utf-8") as f:
    chk = json.load(f)["assets"]
vids = [a for a in chk if a.get("fileType") == "video" and folder_of(a)]
gone = sum(1 for a in vids if not os.path.exists(str(a.get("filePath", ""))))
print(f"\nVERIFICA PERCORSI: video={len(vids)} esistenti={len(vids) - gone} mancanti={gone}")

km2 = {}
for a in vids:
    fold = folder_of(a)
    for n in {a.get("originalFileName"), a.get("renamedFileName"),
              os.path.basename(str(a.get("filePath", "")))}:
        if n:
            km2.setdefault((squash(fold), squash(n)), a)

ok = bad = 0
pairs = []
for fold in disk:
    pt = os.path.join(EDDIE, fold, "prompts.txt")
    if not os.path.exists(pt):
        continue
    for fn, fo, prompt in parse_prompts_txt(pt):
        a = km2.get((squash(fold), squash(fn)))
        if a is None and squash(fn) in rename_map.get(fold, {}):
            a = km2.get((squash(fold), squash(rename_map[fold][squash(fn)])))
        if a is None and fo:
            a = km2.get((squash(fold), squash(fo)))
        if a is None:
            continue
        pairs.append((fold, fn, prompt, norm(a.get("prompt"))))
        if norm(a.get("prompt")) == prompt:
            ok += 1
        else:
            bad += 1
print(f"VERIFICA PROMPT (ricaricato da disco): uguali={ok} DIVERSI={bad}")

random.seed(11)
print("\nCampione casuale di 5 prompt nel vault:")
for fold, fn, disk_p, vault_p in random.sample(pairs, min(5, len(pairs))):
    print(f"  [{fold}] {fn}")
    print(f"    vault == disco: {disk_p == vault_p} | inizio: {vault_p[:85]}")
if renames:
    print("\nCampione rinomine (max 5):")
    for r in renames[:5]:
        print(f"  [{r[0]}] {r[1]} -> {r[2]}")

sys.exit(0 if (bad == 0 and gone == 0) else 3)
