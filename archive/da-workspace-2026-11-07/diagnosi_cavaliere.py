# -*- coding: utf-8 -*-
import json, os, re, collections
CAT = r"H:/Metal Video generation auto/data/vault-catalog.json"
EDDIE = r"D:/Video musicale/EDDIE"
fold = "Cavaliere del deserto"
VIDEO_EXT = {".mp4", ".mov", ".webm", ".mkv"}

cat = json.load(open(CAT, encoding="utf-8"))
assets = cat["assets"]
va = [a for a in assets if a.get("fileType") == "video"
      and re.search(r"EDDIE\\+([^\\]+)\\", str(a.get("filePath", ""))).group(1) == fold]
dpath = os.path.join(EDDIE, fold)
disk = {f: os.path.getsize(os.path.join(dpath, f)) for f in os.listdir(dpath)
        if os.path.isfile(os.path.join(dpath, f)) and os.path.splitext(f)[1].lower() in VIDEO_EXT}

print("vault asset:", len(va), "| file disco:", len(disk))
sizes_disk = collections.Counter(disk.values())
sizes_vault = collections.Counter(int(a.get("fileSizeBytes") or 0) for a in va)
intersezione = set(sizes_vault) & set(sizes_disk)
print("size unici vault:", len(sizes_vault), "| size unici disco:", len(sizes_disk),
      "| intersezione:", len(intersezione))
print()
for a in va[:5]:
    print(f"  vault: {a.get('originalFileName')} | size={a.get('fileSizeBytes')} | dur={a.get('duration')} | path={str(a.get('filePath'))[-60:]}")
print()
print("campione disco:")
for f in list(sorted(disk))[:5]:
    print(f"  disco: {f} | {disk[f]} byte")

# e il prompts.txt?
pt = os.path.join(dpath, "prompts.txt")
txt = open(pt, encoding="utf-8", errors="replace").read()
blocks = txt.split("=" * 50)
print("\nprompts.txt blocchi:", len([b for b in blocks if 'File nuovo:' in b]))
for b in blocks[:2]:
    if "File nuovo:" in b:
        m1 = re.search(r"File nuovo:\s*(.+)", b)
        m2 = re.search(r"File originale:\s*(.+)", b)
        print("  File nuovo:", m1.group(1).strip() if m1 else None)
        print("  File originale:", m2.group(1).strip() if m2 else None)
# i "File nuovo" del prompts.txt combaciano coi nomi su disco?
newnames = [re.search(r"File nuovo:\s*(.+)", b).group(1).strip() for b in blocks if re.search(r"File nuovo:\s*(.+)", b)]
on_disk = set(disk)
match_folder = [n for n in newnames if n in on_disk]
print(f"\n'File nuovo' nel prompts.txt: {len(newnames)} | presenti su disco: {len(match_folder)}")
missing = [n for n in newnames if n not in on_disk]
if missing: print("  non su disco:", missing[:4])

# e gli "File originale" corrispondono agli originalFileName del vault?
origs = [re.search(r"File originale:\s*(.+)", b).group(1).strip() for b in blocks if re.search(r"File originale:\s*(.+)", b)]
vault_origs = {a.get("originalFileName") for a in va}
match_vault = [o for o in origs if o in vault_origs]
print(f"'File originale' nel prompts.txt: {len(origs)} | che esistono come originalFileName nel vault: {len(match_vault)}")
no_match = [o for o in origs if o not in vault_origs]
if no_match: print("  non nel vault:", no_match[:4])
