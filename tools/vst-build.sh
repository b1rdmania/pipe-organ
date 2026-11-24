#!/bin/sh
# Builds the Robot Organ plugin (vst/), runs its offline tests, and installs the
# VST3 and AU for this user if everything passes.
# sh tools/vst-build.sh            build + test + install
# sh tools/vst-build.sh --no-install
set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd)
VST="$ROOT/vst"
cd "$VST"
[ -d JUCE ] || git clone --depth 1 https://github.com/juce-framework/JUCE JUCE
[ -f Resources/voiced.json ] || node "$ROOT/tools/vst-export.mjs"
cmake -B build -G Ninja -DCMAKE_BUILD_TYPE=Release
cmake --build build -j"$(sysctl -n hw.ncpu)"

node "$ROOT/tools/vst-pipe-ref.mjs"
./build/pipe_compare out/pipe-ref
./build/render_test_artefacts/Release/render_test out/test.wav 48000 512

[ "$1" = "--no-install" ] && exit 0
ART="$VST/build/TheVoicer_artefacts/Release"
VST3_DIR="$HOME/Library/Audio/Plug-Ins/VST3"
AU_DIR="$HOME/Library/Audio/Plug-Ins/Components"
mkdir -p "$VST3_DIR" "$AU_DIR"
rm -rf "$VST3_DIR/Robot Organ.vst3" "$AU_DIR/Robot Organ.component"
cp -R "$ART/VST3/Robot Organ.vst3" "$VST3_DIR/"
cp -R "$ART/AU/Robot Organ.component" "$AU_DIR/"
# Make the AU registry rescan, then validate. Run from a Terminal window:
# a background (non-GUI) session cannot see per-user AUs, so auval fails there.
killall -9 AudioComponentRegistrar 2>/dev/null || true
auval -v aumu Vcr1 Bird
