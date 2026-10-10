# -*- coding: utf-8 -*-
"""
Misura il fondo-auto (ultima riga "accesa" dell'immagine) di ogni render in
gui/carmaps e scrive data/car-image-baseline.json: { file: fondo }, dove fondo
e' la frazione dell'altezza alla quale le ruote toccano il pavimento.
Serve al riflesso CSS della pagina Auto (cars.mjs esponde shTop per ogni auto).
Rilanciabile in qualsiasi momento (es. dopo nuove immagini Meta):
  py -3.12 tools/car-baseline.py
"""
from PIL import Image
import json
import os
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(BASE, "gui", "carmaps")
OUT = os.path.join(BASE, "data", "car-image-baseline.json")

W, H = 128, 72          # griglia di campionamento
THRESH = 40             # luminosita' minima per considerare "auto"
MARGIN_PX = 2           # piccolo margine sotto il contatto


def main():
    baseline = {}
    skipped = []
    for name in sorted(os.listdir(DIR)):
        if not name.lower().endswith(".jpg"):
            continue
        path = os.path.join(DIR, name)
        try:
            im = Image.open(path).convert("L").resize((W, H))
            px = list(im.getdata())
            last = -1
            for y in range(H):
                row = px[y * W:(y + 1) * W]
                if max(row) > THRESH:
                    last = y
            if last < 0:
                skipped.append(name)
                continue
            frac = min(0.95, (last + MARGIN_PX) / H)
            baseline[name] = round(frac, 3)
        except Exception:
            skipped.append(name)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(baseline, fh, indent=1)

    n = len(baseline)
    vals = sorted(baseline.values())
    med = vals[n // 2] if n else 0
    print("baseline scritte: %d, scartate: %d" % (n, len(skipped)))
    if skipped:
        print("  scartate:", ", ".join(skipped))
    print("  mediana: %.3f  min: %.3f  max: %.3f" % (med, vals[0], vals[-1]))
    print("  ->", os.path.relpath(OUT, BASE))
    return 0 if n else 1


if __name__ == "__main__":
    sys.exit(main())
