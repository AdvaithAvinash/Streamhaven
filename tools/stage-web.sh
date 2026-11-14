#!/usr/bin/env bash
# Copies the web app (and nothing else) into the directory given as $1.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
DEST=${1:?usage: stage-web.sh <dest-dir>}
mkdir -p "$DEST/assets"
cp "$ROOT/index.html" "$DEST/"
cp -r "$ROOT/css" "$ROOT/js" "$ROOT/vendor" "$DEST/"
cp "$ROOT/assets/icon.png" "$DEST/assets/"
