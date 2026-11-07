#!/usr/bin/env bash
# Sincronizza i file sorgente condivisi con il mirror usato dagli altri tool
# (H:/Vitamed AI/.freebuff/metal-video-auto-editor, struttura piatta).
# Uso: npm run mirror
set -u
MIRROR="/h/Vitamed AI/.freebuff/metal-video-auto-editor"
SRC="$(cd "$(dirname "$0")/.." && pwd)"

fail=0
cp_one() { # src dest
  if ! cp "$1" "$2" 2>/dev/null; then
    echo "⚠️  mirror fallito: $1 → $2"
    fail=1
  fi
}

cp_one "$SRC/server/eddie-engine.ts"        "$MIRROR/eddie-engine.ts"
cp_one "$SRC/server.ts"                     "$MIRROR/server.ts"
cp_one "$SRC/src/components/EddieTimelineView.tsx" "$MIRROR/EddieTimelineView.tsx"
cp_one "$SRC/src/components/StudioChatView.tsx"    "$MIRROR/StudioChatView.tsx"
cp_one "$SRC/src/App.tsx"                   "$MIRROR/App.tsx"
cp_one "$SRC/src/utils/api.ts"              "$MIRROR/api.ts"
cp_one "$SRC/src/types/index.ts"            "$MIRROR/types-index.ts"

if [ "$fail" = "0" ]; then
  echo "MIRROR_OK"
else
  echo "MIRROR_PARZIALE (vedi avvisi sopra)"
  exit 1
fi
