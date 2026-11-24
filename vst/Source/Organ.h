// The York organ played live: a pool of flue pipes, one shared wind, and the
// stops fanning each key out to its ranks. A port of the live parts of
// engine/player.js and the chord player in minster/app.js. Runs at 48 kHz,
// the rate the pipes were voiced at.
#pragma once
#include "FluePipe.h"
#include <array>
#include <atomic>
#include <memory>
#include <bitset>
#include <string>
#include <vector>

namespace voicer {

enum Part { Great = 0, Upper = 1, Pedal = 2, NumParts = 3 };

struct Pipe {
    PipeParams params;
    int part = Great; // which case part's echo it sounds through
    int sag = 0;      // which of the six case sides (wind sag group)
    bool ok = true;
};

// The stop groups, as the app's chord player has them.
// What the editor needs to draw a pipe. Fixed after load().
struct PipeInfo {
    int key = 0, rank = 0, part = Great;
    double length = 0; // speaking length in metres
};

enum StopGroup { Diapason8, Flute8, Octave4, Two, Mixture, Sixteen, PedalStop, NumStops };

class Organ {
public:
    static constexpr double rate = 48000.0;
    static constexpr int lo = 36, hi = 93, pedLo = 36, pedHi = 67;

    // pipes: id "rank:key" -> params. Unknown ids are skipped.
    void load (const std::vector<std::pair<std::string, Pipe>>& pipes);
    void prepare (int maxBlock, int polyphony = 128);

    void setStop (int group, bool on);
    void noteOn (int midiKey);
    void noteOff (int midiKey);
    void allOff();

    // Adds the next n samples (mono, one buffer per case part).
    void render (float* const* parts, int n);
    int active() const;

    const std::vector<PipeInfo>& pipeInfo() const { return info; }
    const std::vector<std::string>& ranks() const { return rankNames; }
    // Per pipe: 1 while it speaks. Written by the audio thread after each render.
    bool sounding (int idx) const { return flags[(size_t) idx].load (std::memory_order_relaxed) != 0; }

private:
    struct Voice {
        FluePipe pipe;
        int pipeIndex = -1;
        bool busy = false;
        double gain = 1;
        int part = 0, sag = 0;
        explicit Voice (uint32_t noiseSeed) : pipe (rate, PipeParams{}, noiseSeed) {}
    };

    int indexOf (const std::string& rank, int key) const;
    void update();
    void start (int idx, double gain);
    void release (int idx);

    std::vector<Pipe> table;
    std::vector<PipeInfo> info;
    std::unique_ptr<std::atomic<uint8_t>[]> flags;
    std::vector<std::string> rankNames;
    std::vector<std::array<int, 128>> byRank; // rank -> key -> table index
    std::vector<Voice> pool;
    std::vector<int> voiceOf; // table index -> voice, or -1
    std::vector<float> want, have;
    std::array<std::vector<int>, NumStops> stopRanks;
    std::array<bool, NumStops> stops { true, false, true, false, false, false, true };
    std::bitset<128> held;
    bool dirty = false;

    // Wind: slow wobble plus sag when many pipes speak, per case side.
    uint32_t seed = 12345;
    double wob = 0, wobble = 0.003;
    std::array<int, 6> sagActive {};
    std::array<std::vector<double>, 6> wind;
};

} // namespace voicer
