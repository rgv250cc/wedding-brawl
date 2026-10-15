#!/usr/bin/env bash
# Fills deploy/public with exactly the files the game page loads (the PAGE allow-list in server.mjs) and nothing else,
# plus _headers (Cloudflare config, not served) with server.mjs's security headers. Then: cd deploy && npx wrangler deploy
set -euo pipefail
cd "$(dirname "$0")/.."
files=$(node -e 'const m = /const PAGE = new Set\(\[([^\]]*)\]/.exec(require("fs").readFileSync("server.mjs", "utf8"));
  for (const [, f] of m ? m[1].matchAll(/["\x27]\/([^"\x27]+)["\x27]/g) : []) console.log(f)')
[ -n "$files" ] || { echo "no PAGE list found in server.mjs" >&2; exit 1; }
rm -rf deploy/public && mkdir deploy/public
for f in $files; do
  case $f in */*|.*|*.py|*.mjs) echo "refusing to publish $f" >&2; exit 1;; esac
  cp "$f" deploy/public/
done
if [ -f voices/index.json ]; then  # the characters' voices: just the sprites and their index
  mkdir deploy/public/voices && cp voices/index.json voices/announcer.mp3 deploy/public/voices/ && cp voices/[0-9]*.mp3 deploy/public/voices/
fi
printf '/*\n  Referrer-Policy: no-referrer\n  X-Content-Type-Options: nosniff\n  X-Robots-Tag: noindex\n' > deploy/public/_headers
echo "deploy/public: $(ls deploy/public | wc -l | tr -d ' ') files, $(du -sh deploy/public | cut -f1)"
