# -*- coding: utf-8 -*-
"""Test in sandbox: rinomina manuale + prompts.txt col vecchio nome -> import corretto."""
import json, os, shutil, subprocess, sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

SB = r"H:/Vitamed AI/.freebuff/vault_test_sandbox"
shutil.rmtree(SB, ignore_errors=True)
folder = os.path.join(SB, "EDDIE", "TestFolder")
os.makedirs(folder)

old = os.path.join(folder, "grok-video-test.mp4")
with open(old, "wb") as f:
    f.write(b"x" * 1000)

cat_path = os.path.join(SB, "vault-catalog.json")
asset = {
    "id": "asset_test_1",
    "originalPath": "TestFolder\\grok-video-test.mp4",
    "originalFileName": "grok-video-test.mp4",
    "renamedFileName": "grok-video-test.mp4",
    "filePath": old.replace("/", "\\"),
    "fileSizeBytes": 1000,
    "fileType": "video",
    "prompt": "VECCHIO PROMPT",
    "duration": 6.0,
    "isRenamed": False,
    "status": "analyzed",
}
with open(cat_path, "w", encoding="utf-8") as f:
    json.dump({"version": 1, "savedAt": "test", "assets": [asset]}, f)

# Mauro rinomina il clip sul disco
new = os.path.join(folder, "clip 01 - Titolo Giusto.mp4")
os.rename(old, new)

# prompts.txt esportato PRIMA della rinomina (usa il vecchio nome)
sep = "=" * 50
with open(os.path.join(folder, "prompts.txt"), "w", encoding="utf-8") as f:
    f.write(sep + "\n001 - Test\nFile originale: grok-video-test.mp4\n"
            "File nuovo: grok-video-test.mp4\nTipo prompt: RICOSTRUITO\n"
            "Prompt:\nNUOVO PROMPT DI PROVA\n" + sep + "\n")

env = dict(os.environ,
           VSO_CAT=cat_path.replace("\\", "/"),
           VSO_EDDIE=os.path.join(SB, "EDDIE"),
           VSO_RENAMEMAP=os.path.join(SB, "vault_rename_map.json"))

r = subprocess.run([sys.executable, r"H:/Vitamed AI/.freebuff/vault_importa_prompt.py"],
                   env=env, capture_output=True, text=True, encoding="utf-8", errors="replace")
print(r.stdout)
if r.stderr:
    print("STDERR:", r.stderr[-400:])

cat = json.load(open(cat_path, encoding="utf-8"))["assets"][0]
checks = {
    "renamedFileName nuovo": cat["renamedFileName"] == "clip 01 - Titolo Giusto.mp4",
    "isRenamed=True": cat["isRenamed"] is True,
    "filePath aggiornato": os.path.basename(cat["filePath"]) == "clip 01 - Titolo Giusto.mp4",
    "provenance originalFileName=intatto": cat["originalFileName"] == "grok-video-test.mp4",
    "prompt importato": cat["prompt"] == "NUOVO PROMPT DI PROVA",
    "file esiste sul disco": os.path.exists(cat["filePath"]),
    "exit 0": r.returncode == 0,
}
for k, v in checks.items():
    print(("PASS" if v else "FAIL"), "-", k)
assert all(checks.values()), "TEST FALLITO"

r2 = subprocess.run([sys.executable, r"H:/Vitamed AI/.freebuff/vault_importa_prompt.py"],
                    env=env, capture_output=True, text=True, encoding="utf-8", errors="replace")
print("\n--- SECONDA RUN (idempotenza) ---")
print(r2.stdout[-500:])
print("IDEMPOTENTE:", "Nessun cambiamento" in r2.stdout and r2.returncode == 0)

shutil.rmtree(SB, ignore_errors=True)
print("\nSANDBOX PULITA - TUTTO OK")
