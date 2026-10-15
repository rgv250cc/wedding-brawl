#!/usr/bin/env bash
# One command per photo: ./build.sh photo.jpg [make_layers.py options]
# Runs the GPU pipeline on `ssh rtx` (make_layers.py, which paints the generated bodies with make_bodies.py) and drops
# layers.js, fighters.js and rigs.js (the joints for the puppets) next to index.html.
# The photographer comes separately: python make_photographer.py his_photo.jpg (on the GPU box), then rerun make_rigs.py.
set -euo pipefail
cd "$(dirname "$0")"
photo=$1; shift
scp -q make_layers.py make_bodies.py make_rigs.py "$photo" rtx:popup-photo/
ssh rtx "cd ~/popup-photo && .venv/bin/python make_layers.py $(printf '%q ' "$(basename "$photo")" "$@")"
ssh rtx "cd ~/popup-photo && .venv/bin/python make_rigs.py out/fighters.js photog.js"
scp -q rtx:popup-photo/out/layers.js rtx:popup-photo/out/fighters.js rtx:popup-photo/rigs.js 'rtx:popup-photo/out/plate_*.jpg' .
echo "done: open index.html (or serve this folder); plate_0..3.jpg are the background options for --plate"
