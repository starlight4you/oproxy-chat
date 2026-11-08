#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

SOURCE="build/icon-512.png"
MASTER="build/icon.png"
ICONSET="build/icon.iconset"

if [ ! -f "$SOURCE" ]; then
  echo "Missing $SOURCE" >&2
  exit 1
fi

rm -rf "$ICONSET"
mkdir -p "$ICONSET"

sips -z 1024 1024 "$SOURCE" --out "$MASTER" >/dev/null

for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$MASTER" \
    --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -z "$double" "$double" "$MASTER" \
    --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done

iconutil -c icns "$ICONSET" -o build/icon.icns
rm -rf "$ICONSET"

echo "Wrote build/icon.png and build/icon.icns"
