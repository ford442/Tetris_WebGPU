#!/bin/bash
# Generate placeholder MP4 loops for all 15 level backgrounds.
# Requires ffmpeg. Output goes to public/assets/video/ (served by Vite).
#
# Prefer: npm run video:placeholders  (also refreshes manifest.json)

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/public/assets/video"
mkdir -p "$OUT"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg not found. Install ffmpeg or use: npm run video:placeholders"
  exit 1
fi

colors=(0x1a0a3a 0x0033cc 0x00cccc 0x00cc00 0xcccc00 0xcc6600 0xcc0000 0x9900cc 0x3366ff 0xff6600 0x00ff99 0x6633ff 0xff3399 0x33ffcc 0x1a0033)

for i in $(seq 1 15); do
  idx=$((i - 1))
  color=${colors[$idx]}
  out="$OUT/bg${i}.mp4"
  echo "Creating $out ..."
  ffmpeg -y -f lavfi -i "color=c=${color}:s=720x1280:d=10" \
    -c:v libx264 -t 10 -pix_fmt yuv420p -movflags +faststart -b:v 800k "$out"
done

echo "Done — run: npm run video:validate"
