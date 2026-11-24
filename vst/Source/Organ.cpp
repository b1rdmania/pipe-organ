#include "Organ.h"
#include <algorithm>

namespace voicer {

static const char* const kStopRanks[NumStops][3] = {
    { "ymDiap8a", nullptr, nullptr },
    { "ymStopped8", nullptr, nullptr },
    { "ymOctave4", nullptr, nullptr },
    { "ymSuper2", nullptr, nullptr },
    { "ymMix15", "ymMix19", "ymMix22" },
    { "ymDouble16", nullptr, nullptr },
    { "ymPedSub16", "ymPedDiap16", nullptr },
};

void Organ::load (const std::vector<std::pair<std::string, Pipe>>& pipes)
{
    table.clear(); info.clear(); rankNames.clear(); byRank.clear();
    for (auto& [id, pipe] : pipes) {
        const auto colon = id.find (':');
        if (colon == std::string::npos) continue;
        const std::string rank = id.substr (0, colon);
        const int key = std::stoi (id.substr (colon + 1));
        if (key < 0 || key > 127) continue;
        auto it = std::find (rankNames.begin(), rankNames.end(), rank);
        size_t r = (size_t) (it - rankNames.begin());
        if (it == rankNames.end()) {
            rankNames.push_back (rank);
            byRank.emplace_back();
            byRank.back().fill (-1);
        }
        byRank[r][(size_t) key] = (int) table.size();
        table.push_back (pipe);
        // Open: period = bore, length = half a wavelength. Stopped: period =
        // 2 x bore, length = a quarter. Both come to bore * c / (2 * rate).
        info.push_back ({ key, (int) r, pipe.part, pipe.params.bore * 343.0 / (2.0 * rate) });
    }
    for (int g = 0; g < NumStops; ++g) {
        stopRanks[(size_t) g].clear();
        for (auto* name : kStopRanks[g])
            if (name) {
                auto it = std::find (rankNames.begin(), rankNames.end(), name);
                if (it != rankNames.end()) stopRanks[(size_t) g].push_back ((int) (it - rankNames.begin()));
            }
    }
    voiceOf.assign (table.size(), -1);
    flags = std::make_unique<std::atomic<uint8_t>[]> (table.size());
    for (size_t i = 0; i < table.size(); ++i) flags[i].store (0);
    want.assign (table.size(), 0.0f);
    have.assign (table.size(), 0.0f);
}

void Organ::prepare (int maxBlock, int polyphony)
{
    pool.clear();
    pool.reserve ((size_t) polyphony);
    // Each voice keeps its own noise stream, seeded as the JS pool is (i + 1).
    for (int i = 0; i < polyphony; ++i) pool.emplace_back ((uint32_t) (i + 1));
    for (auto& w : wind) w.assign ((size_t) std::max (1, maxBlock), 1.0);
    std::fill (voiceOf.begin(), voiceOf.end(), -1);
    std::fill (have.begin(), have.end(), 0.0f);
    dirty = true;
}

int Organ::indexOf (const std::string& rank, int key) const
{
    auto it = std::find (rankNames.begin(), rankNames.end(), rank);
    if (it == rankNames.end() || key < 0 || key > 127) return -1;
    return byRank[(size_t) (it - rankNames.begin())][(size_t) key];
}

void Organ::setStop (int group, bool on)
{
    if (group < 0 || group >= NumStops || stops[(size_t) group] == on) return;
    stops[(size_t) group] = on;
    dirty = true;
}

void Organ::noteOn (int k)  { if (k >= 0 && k < 128 && ! held[(size_t) k]) { held.set ((size_t) k); dirty = true; } }
void Organ::noteOff (int k) { if (k >= 0 && k < 128 && held[(size_t) k]) { held.reset ((size_t) k); dirty = true; } }
void Organ::allOff() { held.reset(); dirty = true; }

// What should be sounding, from the keys held and the stops drawn; then start
// and release pipes to match. A stop drawn while a key is held speaks at once,
// as on a real organ.
void Organ::update()
{
    dirty = false;
    std::fill (want.begin(), want.end(), 0.0f);
    int lowest = -1;
    for (int k = 0; k < 128; ++k) {
        if (! held[(size_t) k]) continue;
        if (lowest < 0) lowest = k;
        int key = k;
        while (key < lo) key += 12;
        while (key > hi) key -= 12;
        for (int g = 0; g < NumStops; ++g) {
            if (g == PedalStop || ! stops[(size_t) g]) continue;
            for (int r : stopRanks[(size_t) g]) {
                const int idx = byRank[(size_t) r][(size_t) key];
                if (idx >= 0) want[(size_t) idx] = 1.0f;
            }
        }
    }
    // The pedal follows the lowest note held, an octave down, kept in its compass.
    if (lowest >= 0 && stops[PedalStop]) {
        int key = lowest - 12;
        while (key > pedHi) key -= 12;
        while (key < pedLo) key += 12;
        for (int r : stopRanks[PedalStop]) {
            const int idx = byRank[(size_t) r][(size_t) key];
            if (idx >= 0) want[(size_t) idx] = 0.8f;
        }
    }
    for (size_t i = 0; i < table.size(); ++i) {
        if (want[i] > 0 && have[i] <= 0) start ((int) i, want[i]);
        else if (want[i] <= 0 && have[i] > 0) release ((int) i);
    }
}

void Organ::start (int idx, double gain)
{
    Voice* v = nullptr;
    const int cur = voiceOf[(size_t) idx];
    // A repeated note reuses its pipe while it still sounds, as player.js does.
    if (cur >= 0 && pool[(size_t) cur].busy && pool[(size_t) cur].pipeIndex == idx) v = &pool[(size_t) cur];
    if (! v) {
        for (auto& c : pool) if (! c.busy) { v = &c; break; }
        if (! v) {
            // Pool full: take the quietest pipe already let go.
            Voice* best = nullptr;
            for (auto& c : pool)
                if (! c.pipe.held() && (! best || c.pipe.envelope() < best->pipe.envelope())) best = &c;
            if (! best) return;
            voiceOf[(size_t) best->pipeIndex] = -1;
            v = best;
        }
        const Pipe& p = table[(size_t) idx];
        v->pipe.set (p.params);
        v->pipe.reset();
        v->pipeIndex = idx;
        v->part = p.part;
        v->sag = p.sag;
        voiceOf[(size_t) idx] = (int) (v - pool.data());
    }
    v->busy = true;
    v->gain = gain;
    v->pipe.noteOn();
    have[(size_t) idx] = (float) gain;
}

void Organ::release (int idx)
{
    have[(size_t) idx] = 0.0f;
    const int cur = voiceOf[(size_t) idx];
    if (cur >= 0 && pool[(size_t) cur].pipeIndex == idx) pool[(size_t) cur].pipe.noteOff();
}

int Organ::active() const
{
    int n = 0;
    for (auto& v : pool) n += v.busy ? 1 : 0;
    return n;
}

void Organ::render (float* const* parts, int n)
{
    if (dirty) update();
    const int cap = (int) wind[0].size();
    for (int off = 0; off < n; off += cap) {
        const int m = std::min (cap, n - off);
        // Wind for this block. The sag is taken from the pipes speaking at the
        // start of the block (player.js updates it every sample).
        for (int i = 0; i < m; ++i) {
            seed ^= seed << 13; seed ^= seed >> 17; seed ^= seed << 5;
            const double r = ((double) seed / 4294967296.0) * 2.0 - 1.0;
            wob += (r - wob) * 0.0005;
            const double w = 1 + wobble * wob * 20;
            for (int s = 0; s < 6; ++s) wind[(size_t) s][(size_t) i] = w - std::min (0.03, sagActive[(size_t) s] * 0.0006);
        }
        sagActive.fill (0);
        for (auto& v : pool) {
            if (! v.busy) continue;
            float* out = parts[v.part] + off;
            const double* wd = wind[(size_t) v.sag].data();
            int i = 0;
            for (; i < m; ++i) {
                out[i] += (float) (v.pipe.tick (wd[i]) * v.gain);
                if (v.pipe.idle()) break;
            }
            if (i < m) {
                v.busy = false;
                if (voiceOf[(size_t) v.pipeIndex] == (int) (&v - pool.data())) voiceOf[(size_t) v.pipeIndex] = -1;
            } else {
                sagActive[(size_t) v.sag]++;
            }
        }
    }
    for (size_t i = 0; i < voiceOf.size(); ++i)
        flags[i].store (voiceOf[i] >= 0 ? 1 : 0, std::memory_order_relaxed);
}

} // namespace voicer
