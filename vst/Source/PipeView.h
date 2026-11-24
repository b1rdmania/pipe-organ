// The organ front: the Diapason 8' as a mitre in the centre (C side left,
// C sharp side right, tallest in the middle), the Pedal 16' as towers either
// side. Pipe lengths are the voiced lengths. A pipe glows while its key
// speaks on any rank of its part; more ranks, brighter.
#pragma once
#include <juce_gui_basics/juce_gui_basics.h>
#include "Organ.h"

class PipeView : public juce::Component, private juce::Timer
{
public:
    PipeView (const voicer::Organ& o, juce::Colour neonIn, juce::Colour inkIn, juce::Colour dimIn)
        : organ (o), neon (neonIn), ink (inkIn), dim (dimIn)
    {
        const auto& info = organ.pipeInfo();
        const auto& ranks = organ.ranks();
        auto rankIndex = [&] (const char* name) {
            for (size_t r = 0; r < ranks.size(); ++r) if (ranks[r] == name) return (int) r;
            return -1;
        };
        const int front = rankIndex ("ymDiap8a"), tower = rankIndex ("ymPedDiap16");
        std::array<double, 128> manLen {}, pedLen {};
        for (size_t i = 0; i < info.size(); ++i) {
            const auto& p = info[i];
            const bool ped = p.part == voicer::Pedal;
            auto& len = ped ? pedLen : manLen;
            const int show = ped ? tower : front;
            if (p.rank == show || (show < 0 && p.length > len[(size_t) p.key])) len[(size_t) p.key] = p.length;
            (ped ? pedOf : manOf)[(size_t) p.key].push_back ((int) i);
        }
        // Ranks per part, to scale the glow.
        std::array<std::vector<int>, 2> seen;
        for (auto& p : info) {
            auto& v = seen[p.part == voicer::Pedal ? 1 : 0];
            if (std::find (v.begin(), v.end(), p.rank) == v.end()) v.push_back (p.rank);
        }
        manRanks = std::max (1, (int) seen[0].size());
        pedRanks = std::max (1, (int) seen[1].size());

        // Mitre: low C in the middle, each side climbs outward.
        std::vector<int> left, right;
        for (int k = voicer::Organ::lo; k <= voicer::Organ::hi; ++k)
            if (manLen[(size_t) k] > 0) ((k % 2 == 0) ? left : right).push_back (k);
        std::vector<int> peds;
        for (int k = voicer::Organ::pedLo; k <= voicer::Organ::pedHi; ++k)
            if (pedLen[(size_t) k] > 0) peds.push_back (k);
        std::vector<int> towerL, towerR;
        for (size_t i = 0; i < peds.size(); ++i) ((i % 2 == 0) ? towerL : towerR).push_back (peds[i]);

        // Left tower: tallest outside. Then the mitre. Then the right tower.
        for (auto it = towerL.begin(); it != towerL.end(); ++it) slots.push_back ({ *it, true, pedLen[(size_t) *it] });
        slots.push_back ({ -1, false, 0 });
        for (auto it = left.rbegin(); it != left.rend(); ++it) slots.push_back ({ *it, false, manLen[(size_t) *it] });
        for (int k : right) slots.push_back ({ k, false, manLen[(size_t) k] });
        slots.push_back ({ -1, false, 0 });
        for (auto it = towerR.rbegin(); it != towerR.rend(); ++it) slots.push_back ({ *it, true, pedLen[(size_t) *it] });
        for (auto& s : slots) maxLen = std::max (maxLen, s.length);
        glow.assign (slots.size(), 0.0f);
        startTimerHz (30);
    }

    void paint (juce::Graphics& g) override
    {
        if (slots.empty() || maxLen <= 0) return;
        const auto r = getLocalBounds().toFloat().reduced (0, 4);
        const float w = r.getWidth() / (float) slots.size();
        const float base = r.getBottom() - 10.0f; // feet below this line
        g.setColour (dim);
        g.drawHorizontalLine ((int) base, r.getX(), r.getRight());
        for (size_t i = 0; i < slots.size(); ++i) {
            const auto& s = slots[i];
            if (s.key < 0) continue;
            // Compress the 64:1 range so the trebles stay visible.
            const float h = (float) std::pow (s.length / maxLen, 0.6) * (base - r.getY() - 2.0f);
            const float pw = juce::jmax (2.0f, w * 0.62f);
            const float x = r.getX() + w * (float) i + (w - pw) * 0.5f;
            const float a = glow[i];
            // The pipe as line art: sides and top, the mouth an open gap above
            // the foot, the upper lip a short line, the foot a cone to its toe.
            const float my = base - juce::jmin (h * 0.5f, pw * 1.2f);
            juce::Path pipe;
            pipe.startNewSubPath (x, base);
            pipe.lineTo (x, base - h);
            pipe.lineTo (x + pw, base - h);
            pipe.lineTo (x + pw, base);
            pipe.startNewSubPath (x + pw * 0.2f, my);
            pipe.lineTo (x + pw * 0.8f, my);
            pipe.startNewSubPath (x, base);
            pipe.lineTo (x + pw * 0.5f, base + 8.0f);
            pipe.lineTo (x + pw, base);
            if (a > 0.01f) {
                // Soft glow: blur 6, 40% neon, scaled by how many ranks speak.
                juce::DropShadow (neon.withAlpha (0.4f * a), 6, {}).drawForPath (g, pipe);
                g.setColour (neon.withAlpha (juce::jmin (1.0f, 0.5f + 0.5f * a)));
            } else {
                g.setColour (ink.withAlpha (s.pedal ? 0.35f : 0.5f));
            }
            g.strokePath (pipe, juce::PathStrokeType (1.0f));
        }
    }

private:
    struct Slot { int key; bool pedal; double length; };

    void timerCallback() override
    {
        bool any = false;
        for (size_t i = 0; i < slots.size(); ++i) {
            const auto& s = slots[i];
            float target = 0.0f;
            if (s.key >= 0) {
                int n = 0;
                for (int idx : (s.pedal ? pedOf : manOf)[(size_t) s.key]) n += organ.sounding (idx) ? 1 : 0;
                if (n > 0) target = 0.45f + 0.55f * juce::jmin (1.0f, (float) n / (float) (s.pedal ? pedRanks : manRanks) * 3.0f);
            }
            const float next = target > glow[i] ? target : glow[i] * 0.82f; // quick on, slow fade
            if (std::abs (next - glow[i]) > 0.002f) any = true;
            glow[i] = next < 0.01f ? 0.0f : next;
        }
        if (any) repaint();
    }

    const voicer::Organ& organ;
    juce::Colour neon, ink, dim;
    std::vector<Slot> slots;
    std::vector<float> glow;
    std::array<std::vector<int>, 128> manOf, pedOf;
    int manRanks = 1, pedRanks = 1;
    double maxLen = 0;
};
