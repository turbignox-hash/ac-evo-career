# -*- coding: utf-8 -*-
"""Decidere con cosa iniziano DAVVERO i due finali: confronto frame accurato vs sorgenti."""
import json, os, subprocess, re, hashlib

BASE = r"C:/Users/Mauro/Documents/MetalVideoAutoEditor"
V1 = r"D:/Video musicale/1 Nuovi progetti/Eddie - King Who Cannot Die - Cavaliere del deserto - montaggio.mp4"
V2 = r"D:/Video musicale/EDDIE/Chiamata a casa/Chiamata a casa - montaggio.mp4"
pf = json.load(open(os.path.join(BASE, "snapshot_1791378426576_0bks", "plan.json"), encoding="utf-8"))
pc = json.load(open(os.path.join(BASE, "snapshot_1791384760522_2gbs", "plan.json"), encoding="utf-8"))
TMP = r"H:/Vitamed AI/.freebuff/tmp_frames"
os.makedirs(TMP, exist_ok=True)

def frame_out_seek(src, t, out):
    """Seek di OUTPUT (dopo -i): preciso al frame, niente chiavi."""
    subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                    "-i", src, "-ss", f"{t:.3f}", "-frames:v", "1",
                    "-vf", "scale=464:688", "-q:v", "2", out],
                   timeout=120, check=True)

def frame_in_seek(src, t, out):
    subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                    "-ss", f"{t:.3f}", "-i", src, "-frames:v", "1",
                    "-vf", "scale=464:688", "-q:v", "2", out],
                   timeout=120, check=True)

def psnr(a, b):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", a, "-i", b,
                        "-filter_complex", "psnr", "-f", "null", "-"],
                       capture_output=True, text=True, timeout=60)
    m = re.search(r"average:([\d.]+|inf)", r.stderr)
    return 999.0 if (m and m.group(1) == "inf") else (float(m.group(1)) if m else 0.0)

# shot 0 di entrambi i piani: (file copia, start offset nella clip)
s0_cav = pf["shots"][0]; s0_chi = pc["shots"][0]
print("Cavaliere shot0:", os.path.basename(s0_cav["file"]), "start=", s0_cav["start"], "dur=", s0_cav["dur"])
print("Chiamata  shot0:", os.path.basename(s0_chi["file"]), "start=", s0_chi["start"], "dur=", s0_chi["dur"])

# frame a meta' del PRIMO segmento dei finali (t=1.44) con seek PRECISO
frame_out_seek(V1, 1.44, os.path.join(TMP, "v1_acc.jpg"))
frame_out_seek(V2, 1.44, os.path.join(TMP, "v2_acc.jpg"))
p_v1v2 = psnr(os.path.join(TMP, "v1_acc.jpg"), os.path.join(TMP, "v2_acc.jpg"))
print(f"\nPSNR V1 vs V2 @1.44s (seek preciso): {p_v1v2}")

# frame del PRIMO segmento di ogni video vs le 2 candidate sorgenti
# contenuto atteso nel video al tempo t_video = clip.start + (t_video - t_shot0)
t_video = 1.44
cand = {
    "Acero(pianoCav)": (s0_cav["file"], s0_cav["start"] + t_video),
    "Canto(pianoChi)": (s0_chi["file"], s0_chi["start"] + t_video),
}
for name, (src, tsrc) in cand.items():
    frame_in_seek(src, tsrc, os.path.join(TMP, "src_tmp.jpg"))
    p1 = psnr(os.path.join(TMP, "v1_acc.jpg"), os.path.join(TMP, "src_tmp.jpg"))
    p2 = psnr(os.path.join(TMP, "v2_acc.jpg"), os.path.join(TMP, "src_tmp.jpg"))
    print(f"  {name}: PSNR con V1={p1:6.1f} | con V2={p2:6.1f}")

# anche la CLIP ORIGINALE (non la copia snapshot) se src è noto per Chiamata
orig = pc["shots"][0].get("src")
if orig and os.path.exists(orig):
    frame_in_seek(orig, s0_chi["start"] + t_video, os.path.join(TMP, "orig_tmp.jpg"))
    print(f"  ORIGINALE Chiamata ({os.path.basename(orig)[:40]}): PSNR con V2={psnr(os.path.join(TMP,'v2_acc.jpg'), os.path.join(TMP,'orig_tmp.jpg')):6.1f}")

# dimensioni dei frame estratti (nero = pochi KB)
for f in ("v1_acc.jpg", "v2_acc.jpg"):
    p = os.path.join(TMP, f)
    print(f"  {f}: {os.path.getsize(p)} byte")
