# -*- coding: utf-8 -*-
import json, os, re, datetime
CAT = r"H:/Metal Video generation auto/data/vault-catalog.json"
EDDIE = r"D:/Video musicale/EDDIE"
FOLDS = ["Cavalco con i fantasmi", "Cavaliere del deserto"]
VIDEO_EXT = {".mp4", ".mov", ".webm", ".mkv"}

cat = json.load(open(CAT, encoding="utf-8"))
assets = cat["assets"]
print("savedAt:", cat.get("savedAt"), "| asset totali:", len(assets))

TEMPLATES = ("Cinematic 4k heavy metal masterpiece", "Iron Berserker Warrior", "Midnight Thunder Sorcerer", "Undead Pharaoh King", "Eddie The Head")
def is_tpl(p): return p and any(p.startswith(t) for t in TEMPLATES)

for fold in FOLDS:
    print("\n" + "=" * 70)
    print("CARTELLA:", fold)
    # disco
    dpath = os.path.join(EDDIE, fold)
    if not os.path.isdir(dpath):
        print("  !! cartella NON ESISTE su disco")
        continue
    disk = [(f, os.path.getsize(os.path.join(dpath, f))) for f in os.listdir(dpath)
            if os.path.isfile(os.path.join(dpath, f)) and os.path.splitext(f)[1].lower() in VIDEO_EXT]
    has_pt = os.path.exists(os.path.join(dpath, "prompts.txt"))
    print(f"  disco: {len(disk)} video | prompts.txt: {'SI (' + str(os.path.getsize(os.path.join(dpath,'prompts.txt'))) + ' byte)' if has_pt else 'NO'}")
    other = [f for f in os.listdir(dpath) if not f.lower().endswith(tuple(VIDEO_EXT))]
    if other:
        print("  altri file:", other[:6], "..." if len(other) > 6 else "")
    # vault
    va = [a for a in assets if a.get("fileType") == "video"
          and re.search(r"EDDIE\\+([^\\]+)\\", str(a.get("filePath", ""))).group(1) == fold]
    print(f"  vault: {len(va)} asset video in questa cartella")
    # abbinamenti disco->vault per basename
    vmap = {}
    for a in va:
        vmap.setdefault(os.path.basename(str(a.get("filePath", ""))).lower(), a)
    matched = sum(1 for f, _ in disk if f.lower() in vmap)
    missing_on_vault = [f for f, _ in disk if f.lower() not in vmap]
    print(f"  percorsi vault esistenti su disco: {matched}/{len(disk)}")
    if missing_on_vault:
        print("  file disco non puntati da alcun vault asset:", missing_on_vault[:5], "..." if len(missing_on_vault) > 5 else "")
    # stati
    ren = [a for a in va if a.get("isRenamed")]
    tpl = [a for a in va if is_tpl(str(a.get("prompt", "")))]
    empty = [a for a in va if not str(a.get("prompt", "")).strip()]
    other_p = [a for a in va if a not in tpl and a not in empty]
    print(f"  isRenamed: {len(ren)} | prompt template: {len(tpl)} | vuoti: {len(empty)} | veri: {len(other_p)}")
    if tpl: print("   tpl esempio:", tpl[0].get("renamedFileName"), "|", str(tpl[0].get("prompt", ""))[:60])
    if other_p: print("   vero esempio:", other_p[0].get("renamedFileName"), "|", str(other_p[0].get("prompt", ""))[:80])
    # campione rinomine
    sample = [a for a in va if a.get("isRenamed") and not os.path.basename(str(a.get("originalFileName",""))).lower() == os.path.basename(str(a.get("filePath",""))).lower()]
    for a in sample[:3]:
        print(f"   orig: {a.get('originalFileName')} -> ren: {a.get('renamedFileName')}")

# natura crescita catalogo: conta asset con prompt che iniziano per template globalmente
all_tpl = sum(1 for a in assets if is_tpl(str(a.get("prompt", ""))))
all_empty = sum(1 for a in assets if not str(a.get("prompt", "")).strip())
all_real = len(assets) - all_tpl - all_empty
print("\nGLOBAL: template:", all_tpl, "| vuoti:", all_empty, "| veri:", all_real)
# mouth check: dimensione catalogo
print("size catalogo:", os.path.getsize(CAT))
