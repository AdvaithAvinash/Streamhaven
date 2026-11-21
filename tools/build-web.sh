#!/usr/bin/env bash
# Builds the static site for Cloudflare Pages (or any static host) into $1 (default: public/).
# Only the web app is copied: no keystore, packages, tests or Android sources.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
DEST=${1:-$ROOT/public}
rm -rf "$DEST"
"$ROOT/tools/stage-web.sh" "$DEST"
cp "$ROOT/tools/cloudflare/_headers" "$DEST/_headers"
echo "Web build written to $DEST ($(find "$DEST" -type f | wc -l) files)"
