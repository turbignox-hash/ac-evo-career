# -*- coding: utf-8 -*-
"""Le clip SORGENTE dei primi shot dei 2 piani: PSNR incrociato (verita' visiva) vs md5."""
import json, os, subprocess, re, hashlib

BASE = r"C:/Users/Mauro/Documents/MetalVideoAutoEditor"
pf = json.load(open(os.path.join(BASE, "snapshot_1791378426576_0bks", "plan.json"), encoding="utf-8"))  # Cavaliere
pc = json.load(open(os.path.join(BASE, "snapshot_1791384760522_2gbs", "plan.json"), encoding="utf-8"))  # Chiamata
TMP = r"H:/Vitamed AI/.freebuff/tmp_frames"
os.makedirs(TMP, exist_ok=True)

def md5(p):
    h = hashlib.md5()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()

def midframe(src, start, dur, out):
    t = start + dur / 2
    subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                    "-ss", f"{t:.3f}", "-i", src, "-frames:v", "1",
                    "-vf", "scale=464:688", "-q:v", "2", out],
                   timeout=60, check=True)

def psnr(a, b):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", a, "-i", b,
                        "-filter_complex", "psnr", "-f", "null", "-"],
                       capture_output=True, text=True, timeout=60)
    m = re.search(r"average:([\d.]+|inf)", r.stderr)
    return 999.0 if (m and m.group(1) == "inf") else (float(m.group(1)) if m else 0.0)

print(f"{'#':>3} {'md5uguale':>9} {'PSNR':>7}  Cavaliere -> Chiamata")
for i in range(8):
    a, b = pf["shots"][i], pc["shots"][i]
    fa, fb = os.path.join(TMP, f"a_{i}.jpg"), os.path.join(TMP, f"b_{i}.jpg")
    # frame al TEMPO DI MONTAGGIO: t relativo al segmento -> usare start+offset+dur/2 della CLIP
    midframe(a["file"], a["start"], a["dur"], fa)
    midframe(b["file"], b["start"], b["dur"], fb)
    p = psnr(fa, fb)
    same_hash = md5(a["file"]) == md5(b["file"])
    tag = "PIXEL-UGUALI" if p >= 18 else ("simili" if p >= 10 else "diverse")
    print(f"{i:>3} {str(same_hash):>9} {p:>7.1f}  {os.path.basename(a['file'])[:38]} -> {os.path.basename(b['file'])[:38]} [{tag}]")
