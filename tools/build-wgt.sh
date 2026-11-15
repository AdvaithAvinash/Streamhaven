#!/usr/bin/env bash
# Builds dist/Streamhaven.wgt (Samsung Tizen TV web widget).
#   - With the Tizen CLI and a signing profile (TIZEN_PROFILE=<name>) the package is signed.
#   - Otherwise an UNSIGNED widget is produced; sign it in Tizen Studio (see README) before installing on a TV.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT=${OUT:-$ROOT/dist}; STAGE=$(mktemp -d); mkdir -p "$OUT"
trap 'rm -rf "$STAGE"' EXIT
"$ROOT/tools/stage-web.sh" "$STAGE"
cp "$ROOT/config.xml" "$STAGE/"
if command -v tizen >/dev/null && [ -n "${TIZEN_PROFILE:-}" ]; then
  tizen package -t wgt -s "$TIZEN_PROFILE" -o "$OUT" -- "$STAGE"
  echo "Signed widget written to $OUT"
else
  rm -f "$OUT/Streamhaven.wgt"
  (cd "$STAGE" && zip -q -X -r "$OUT/Streamhaven.wgt" config.xml index.html assets css js vendor)
  echo "Unsigned widget written to $OUT/Streamhaven.wgt"
fi
