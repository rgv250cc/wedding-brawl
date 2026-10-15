#!/usr/bin/env bash
# One command per photo: ./build.sh photo.jpg [make_layers.py options]
# Runs the GPU pipeline on `ssh rtx` and drops layers.js + fighters.js next to index.html.
set -euo pipefail
cd "$(dirname "$0")"
photo=$1; shift
scp -q make_layers.py "$photo" rtx:popup-photo/
ssh rtx "cd ~/popup-photo && .venv/bin/python make_layers.py $(printf '%q ' "$(basename "$photo")" "$@")"
scp -q rtx:popup-photo/out/layers.js rtx:popup-photo/out/fighters.js 'rtx:popup-photo/out/plate_*.jpg' .
echo "done: open index.html (or serve this folder); plate_0..3.jpg are the background options for --plate"
