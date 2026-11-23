#!/bin/bash
# Build a Tesseract project from tools/film.mjs output.
# tools/film-build.sh <outDir>   (after: node tools/film.mjs ... <outDir>)
set -euo pipefail
T="$HOME/Library/Application Support/Tesseract/bin/tsrct"
cd "$1"
rm -f voicer.tsrct
"$T" project create --project voicer.tsrct --width 1080 --height 1350 >/dev/null
for f in *.wav; do "$T" project import-asset --project voicer.tsrct --file "$PWD/$f" --asset-id "stem-$(basename "$f" .wav)" --kind audio >/dev/null; done
"$T" project apply --project voicer.tsrct --actions actions.json > apply.log
"$T" project checkout --project voicer.tsrct --output editable.json >/dev/null
python3 -c "import json;d=json.load(open('editable.json'));d['duration']=json.load(open('film.json'))['end'];json.dump(d,open('editable.json','w'))"
"$T" project commit --project voicer.tsrct --file editable.json >/dev/null
rm editable.json
echo built "$1/voicer.tsrct"
