// Renders the pipes in out/pipe-ref/cases.txt with the C++ FluePipe and
// compares them sample by sample with the JS renders (tools/vst-pipe-ref.mjs).
// pipe_compare <dir>
#include "FluePipe.h"
#include <cstdio>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

int main (int argc, char** argv)
{
    const std::string dir = argc > 1 ? argv[1] : "out/pipe-ref/";
    std::ifstream in (dir + "/cases.txt");
    if (! in) { std::fprintf (stderr, "no %s/cases.txt\n", dir.c_str()); return 2; }
    std::string line;
    int c = 0, fails = 0;
    double worst = 0;
    while (std::getline (in, line)) {
        if (line.empty()) continue;
        std::istringstream s (line);
        std::string id; uint32_t seed; int n, off, stopped;
        voicer::PipeParams p;
        s >> id >> seed >> n >> off >> p.bore >> p.jetRatio >> p.jetRefl >> p.endRefl >> p.breath >> p.noise
          >> p.chiff >> p.gain >> p.foot >> p.kick >> p.bright >> p.rad >> stopped;
        p.stopped = stopped != 0;
        std::vector<double> js ((size_t) n);
        std::ifstream f (dir + "/" + std::to_string (c) + ".f64", std::ios::binary);
        f.read (reinterpret_cast<char*> (js.data()), (std::streamsize) (n * sizeof (double)));
        voicer::FluePipe pipe (48000.0, p, seed);
        pipe.noteOn();
        double maxErr = 0, peak = 0;
        int at = -1;
        for (int i = 0; i < n; ++i) {
            if (i == off) pipe.noteOff();
            const double wind = i < n / 3.0 ? 1.0 : i < 2.0 * n / 3.0 ? 0.97 : 1.03;
            const double y = pipe.tick (wind);
            const double e = std::abs (y - js[(size_t) i]);
            if (e > maxErr) { maxErr = e; at = i; }
            peak = std::max (peak, std::abs (js[(size_t) i]));
        }
        const double rel = peak > 0 ? maxErr / peak : 0;
        worst = std::max (worst, rel);
        if (rel > 1e-4) ++fails;
        std::printf ("%-16s %6d samples  peak %.4f  max |C++ - JS| %.3e (%.3e of peak) at %d\n", id.c_str(), n, peak, maxErr, rel, at);
        ++c;
    }
    std::printf ("%d pipes, worst %.3e of peak: %s\n", c, worst, fails ? "MISMATCH" : "match");
    return fails ? 1 : 0;
}
