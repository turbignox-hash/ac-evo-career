# -*- coding: utf-8 -*-
"""Verita' sui FILE FINALI: tagli di scena nei primi 45s di entrambi i montaggi,
frame centrale per segmento, PSNR incrociato per indice. Alta PSNR = stessa clip."""
import subprocess, re, os, json

V1 = r"D:/Video musicale/1 Nuovi progetti/Eddie - King Who Cannot Die - Cavaliere del deserto - montaggio.mp4"  # Cavaliere (ieri)
V2 = r"D:/Video musicale/EDDIE/Chiamata a casa/Chiamata a casa - montaggio.mp4"  # Chiamata (oggi)
TMP = r"H:/Vitamed AI/.freebuff/tmp_frames"
os.makedirs(TMP, exist_ok=True)

def cuts(path, upto=45.0):
    """Tempi dei tagli di scena (hard cuts) nei primi N secondi."""
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats",
                        "-t", str(upto), "-i", path,
                        "-vf", "select='gt(scene,0.30)',showinfo",
                        "-f", "null", "-"],
                       capture_output=True, text=True, timeout=300)
    ts = [float(m) for m in re.findall(r"pts_time:([\d.]+)", r.stderr)]
    return [t for t in ts if 0.5 < t < upto]

def midframe(path, t, out):
    subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                    "-ss", f"{t:.3f}", "-i", path, "-frames:v", "1",
                    "-vf", "scale=464:688", "-q:v", "2", out],
                   timeout=60, check=True)

def psnr(a, b):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", a, "-i", b,
                        "-filter_complex", "psnr", "-f", "null", "-"],
                       capture_output=True, text=True, timeout=60)
    m = re.search(r"average:([\d.]+|inf)", r.stderr)
    return 999.0 if (m and m.group(1) == "inf") else (float(m.group(1)) if m else 0.0)

c1, c2 = cuts(V1), cuts(V2)
print("tagli rilevati V1 (Cavaliere):", [round(t, 2) for t in c1[:12]])
print("tagli rilevati V2 (Chiamata) :", [round(t, 2) for t in c2[:12]])

# segmenti = [0,c1), [c1,c2)...; confronto i primi 8 per indice
segs1, segs2 = [], []
bounds1 = [0.0] + c1; bounds2 = [0.0] + c2
for i in range(min(8, len(bounds1))):
    a = bounds1[i]; b = bounds1[i + 1] if i + 1 < len(bounds1) else bounds1[-1] + 1
    segs1.append((a + b) / 2)
for i in range(min(8, len(bounds2))):
    a = bounds2[i]; b = bounds2[i + 1] if i + 1 < len(bounds2) else bounds2[-1] + 1
    segs2.append((a + b) / 2)

n = min(len(segs1), len(segs2))
print(f"\nconfronto PSNR dei primi {n} segmenti (frame centrale):")
match = 0
for i in range(n):
    f1 = os.path.join(TMP, f"v1_{i}.jpg"); f2 = os.path.join(TMP, f"v2_{i}.jpg")
    midframe(V1, segs1[i], f1); midframe(V2, segs2[i], f2)
    p = psnr(f1, f2)
    tag = "STESSA CLIP ✓" if p >= 18 else "diversa"
    if p >= 18: match += 1
    print(f"  seg {i}: t1={segs1[i]:6.2f}s t2={segs2[i]:6.2f}s PSNR={p:6.1f} → {tag}")
print(f"\nPRIMI SEGMENTI IDENTICI: {match}/{n}")
