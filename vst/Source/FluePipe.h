// One flue pipe: a jet-drive waveguide. A line-for-line port of engine/pipe.js.
// State is double (JS numbers), delay lines are float (JS Float32Array), so the
// output matches the JS sample for sample within float error.
#pragma once
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <vector>

namespace voicer {

struct PipeParams {
    double bore = 100, jetRatio = 0.45, jetRefl = 0.5, endRefl = 0.5;
    double breath = 0.9, noise = 0, chiff = 0, gain = 0;
    double foot = 1, kick = 0.35, bright = 6, rad = 0, offset = 0;
    double attack = 0.004, release = 0.002, chiffDecay = 0.9985, lossGain = 0.995;
    bool stopped = false;
};

class Delay {
public:
    explicit Delay (int n) : buf ((size_t) n, 0.0f), size (n) {}
    // Read d samples back (fractional, linear), then write x.
    inline double tick (double x, double d) {
        double r = (double) w - d;
        while (r < 0) r += size;
        const int i = (int) r; // r | 0, r >= 0
        const double f = r - i;
        const double a = buf[(size_t) i];
        const double b = buf[(size_t) ((i + 1) % size)];
        const double y = a + (b - a) * f;
        buf[(size_t) w] = (float) x;
        w = (w + 1) % size;
        return y;
    }
    void clear() { std::fill (buf.begin(), buf.end(), 0.0f); }
private:
    std::vector<float> buf;
    int size, w = 0;
};

// xorshift32, as makeRng in pipe.js.
struct Rng {
    uint32_t s;
    explicit Rng (uint32_t seed) : s (seed ? seed : 1u) {}
    inline double operator()() {
        s ^= s << 13; s ^= s >> 17; s ^= s << 5;
        return ((double) s / 4294967296.0) * 2.0 - 1.0;
    }
};

class FluePipe {
public:
    FluePipe (double sampleRate, const PipeParams& params, uint32_t seed = 1)
        : sr (sampleRate),
          bore ((int) std::ceil (sampleRate / 12) + 8),
          jet ((int) std::ceil (sampleRate / 12) + 8),
          rand (seed) { set (params); reset(); }

    void set (const PipeParams& np) {
        p = np;
        boreLen = std::max (2.0, p.bore);
        const double period = p.stopped ? 2 * boreLen : boreLen;
        foot = std::max (0.05, p.foot);
        jetLen = std::max (1.0, (period * p.jetRatio) / std::sqrt (foot));
        const double fc = std::min (0.45 * sr, p.bright * (sr / period));
        lossA = std::exp ((-2 * M_PI * fc) / sr);
        lossG = p.lossGain;
        radScale = period / (2 * M_PI);
        sign = p.stopped ? -1 : 1;
    }

    // Note: lastBore is not cleared here, as in pipe.js.
    void reset() {
        bore.clear(); jet.clear();
        lp = dcx = dcy = env = target = chiffEnv = kickEnv = 0;
        tPrev = 0;
    }

    void noteOn() { target = 1; chiffEnv = 1; kickEnv = 1; }
    void noteOff() { target = 0; }

    inline double tick (double wind = 1) {
        const double rate = target > env ? p.attack : p.release;
        env += (target - env) * rate;

        lp = (1 - lossA) * lastBore + lossA * lp;
        double t = sign * lp * lossG;
        const double dc = t - dcx + 0.9995 * dcy;
        dcx = t; dcy = dc; t = dc;

        chiffEnv *= p.chiffDecay;
        kickEnv *= 0.9993;
        const double n = rand();
        const double A = foot;
        const double breath = A * p.breath * env * wind * (1 + p.noise * n) * (1 + p.kick * kickEnv)
                            + A * p.chiff * chiffEnv * env * n;

        const double pd = breath - p.jetRefl * t;
        const double jd = jet.tick (pd, jetLen);
        const double o = p.offset;
        const double xj = jd / A + o;
        double j = xj * (xj * xj - 1) - o * (o * o - 1);
        if (j > 1) j = 1; else if (j < -1) j = -1;
        j *= A;

        const double into = j + p.endRefl * t;
        lastBore = bore.tick (into, boreLen);
        const double d = (t - tPrev) * radScale;
        tPrev = t;
        return (t + p.rad * d) * p.gain;
    }

    bool idle() const { return target <= 0 && env < 1e-4; }
    double envelope() const { return env; }
    bool held() const { return target > 0; }

private:
    double sr;
    Delay bore, jet;
    Rng rand;
    PipeParams p;
    double boreLen = 2, foot = 1, jetLen = 1, lossA = 0, lossG = 0.995, radScale = 1, sign = 1;
    double lp = 0, dcx = 0, dcy = 0, env = 0, target = 0, chiffEnv = 0, kickEnv = 0, tPrev = 0;
    double lastBore = 0;
};

} // namespace voicer
