# -*- coding: utf-8 -*-
import json, os, re
CAT = r"H:/Metal Video generation auto/data/vault-catalog.json"
EDDIE = r"D:/Video musicale/EDDIE"
FOLD = "Contro il destino"
cat = json.load(open(CAT, encoding="utf-8"))
assets = cat["assets"]
va = [a for a in assets if a.get("fileType") == "video"
      and re.search(r"EDDIE\\+([^\\]+)\\", str(a.get("filePath", ""))).group(1) == FOLD]
dpath = os.path.join(EDDIE, FOLD)
disk = {f for f in os.listdir(dpath) if os.path.splitext(f)[1].lower() in {".mp4", ".mov", ".webm", ".mkv"}}
print("vault clip:", len(va), "| video su disco:", len(disk))
ok = sum(1 for a in va if os.path.exists(str(a.get("filePath", ""))))
tpl = sum(1 for a in va if str(a.get("prompt", "")).startswith(("Cinematic 4k", "Iron Berserker", "Midnight Thunder", "Undead Pharaoh", "Eddie The Head")))
ren = sum(1 for a in va if a.get("isRenamed"))
rotte = [os.path.basename(str(a.get("filePath", ""))) for a in va if not os.path.exists(str(a.get("filePath", "")))]
print("percorsi ok:", ok, "/", len(va), "| template:", tpl, "| isRenamed:", ren)
print("percorsi rotti:", rotte[:4] if rotte else "NESSUNO")
pt = os.path.join(dpath, "prompts.txt")
print("prompts.txt:", round(os.path.getsize(pt)) if os.path.exists(pt) else "ASSENTE", "byte")
if os.path.exists(pt):
    blocks = [b for b in open(pt, encoding="utf-8", errors="replace").read().split("=" * 50) if "File nuovo:" in b]
    print("blocchi nel prompts.txt:", len(blocks))
# esempio rinomina dalla mappa
m = json.load(open(r"H:/Vitamed AI/.freebuff/vault_rename_map.json", encoding="utf-8"))
items = list(m.get(FOLD, {}).items())[:3]
for old, new in items:
    print("mappa:", old, "->", new)
# esempio clip nel vault
a0 = va[0]
print("esempio vault:", a0.get("renamedFileName"), "| prompt:", str(a0.get("prompt", ""))[:70])
print("savedAt:", cat.get("savedAt"))
