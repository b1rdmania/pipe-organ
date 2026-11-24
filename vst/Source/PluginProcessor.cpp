#include "PluginProcessor.h"
#include "PluginEditor.h"
#include "BinaryData.h"

using namespace voicer;

const char* const VoicerProcessor::stopIds[NumStops]   = { "diapason8", "flute8", "octave4", "two", "mixture", "sixteen", "pedal" };
const char* const VoicerProcessor::stopNames[NumStops] = { "Diapason 8\xe2\x80\xb2", "Flute 8\xe2\x80\xb2", "Octave 4\xe2\x80\xb2", "2\xe2\x80\xb2", "Mixture", "16\xe2\x80\xb2", "Pedal" };
static const bool stopDefaults[NumStops] = { true, false, true, false, false, false, true };

juce::AudioProcessorValueTreeState::ParameterLayout VoicerProcessor::layout()
{
    juce::AudioProcessorValueTreeState::ParameterLayout l;
    for (int i = 0; i < NumStops; ++i)
        l.add (std::make_unique<juce::AudioParameterBool> (juce::ParameterID { stopIds[i], 1 }, juce::String::fromUTF8 (stopNames[i]), stopDefaults[i]));
    l.add (std::make_unique<juce::AudioParameterFloat> (juce::ParameterID { "echo", 1 }, "Echo", juce::NormalisableRange<float> (0.0f, 1.0f), 1.0f,
                                                        juce::AudioParameterFloatAttributes().withStringFromValueFunction ([] (float v, int) { return juce::String (juce::roundToInt (v * 100)) + "%"; })));
    l.add (std::make_unique<juce::AudioParameterFloat> (juce::ParameterID { "output", 1 }, "Output", juce::NormalisableRange<float> (-48.0f, 12.0f, 0.1f), 0.0f,
                                                        juce::AudioParameterFloatAttributes().withLabel ("dB").withStringFromValueFunction ([] (float v, int) { return juce::String (v, 1) + " dB"; })));
    return l;
}

static juce::AudioBuffer<float> readWav (const void* data, int size)
{
    juce::WavAudioFormat wav;
    std::unique_ptr<juce::AudioFormatReader> r (wav.createReaderFor (new juce::MemoryInputStream (data, (size_t) size, false), true));
    juce::AudioBuffer<float> b;
    if (r == nullptr) return b;
    b.setSize ((int) r->numChannels, (int) r->lengthInSamples);
    r->read (&b, 0, (int) r->lengthInSamples, 0, true, true);
    return b;
}

VoicerProcessor::VoicerProcessor()
    : AudioProcessor (BusesProperties().withOutput ("Output", juce::AudioChannelSet::stereo(), true)),
      state (*this, nullptr, "Voicer", layout())
{
    for (int i = 0; i < NumStops; ++i) stopParams[(size_t) i] = state.getRawParameterValue (stopIds[i]);
    echoParam = state.getRawParameterValue ("echo");
    outParam = state.getRawParameterValue ("output");

    // The voiced pipes (tools/vst-export.mjs).
    std::vector<std::pair<std::string, Pipe>> pipes;
    auto json = juce::JSON::parse (juce::String::fromUTF8 (BinaryData::voiced_json, BinaryData::voiced_jsonSize));
    if (auto* obj = json["pipes"].getDynamicObject()) {
        for (auto& prop : obj->getProperties()) {
            const auto& v = prop.value;
            Pipe p;
            auto num = [&v] (const char* k, double d) { return v.hasProperty (k) ? (double) v[k] : d; };
            PipeParams& q = p.params;
            q.bore = num ("bore", q.bore); q.jetRatio = num ("jetRatio", q.jetRatio);
            q.jetRefl = num ("jetRefl", q.jetRefl); q.endRefl = num ("endRefl", q.endRefl);
            q.breath = num ("breath", q.breath); q.noise = num ("noise", q.noise);
            q.chiff = num ("chiff", q.chiff); q.gain = num ("gain", q.gain);
            q.foot = num ("foot", q.foot); q.kick = num ("kick", q.kick);
            q.bright = num ("bright", q.bright); q.rad = num ("rad", q.rad);
            q.offset = num ("offset", q.offset); q.attack = num ("attack", q.attack);
            q.release = num ("release", q.release); q.chiffDecay = num ("chiffDecay", q.chiffDecay);
            q.lossGain = num ("lossGain", q.lossGain);
            q.stopped = v.hasProperty ("stopped") && (bool) v["stopped"];
            const auto part = v["group"].toString();
            p.part = part == "upper" ? Upper : part == "pedal" ? Pedal : Great;
            static const juce::StringArray sides { "greatC", "greatCs", "upperC", "upperCs", "pedalC", "pedalCs" };
            p.sag = juce::jmax (0, sides.indexOf (v["sag"].toString()));
            p.ok = (bool) v["ok"];
            pipes.emplace_back (prop.name.toString().toStdString(), p);
        }
    }
    organ.load (pipes);

    // The Minster heard from the three parts of the case, direct sound included.
    irs[Great] = readWav (BinaryData::irgreat_wav, BinaryData::irgreat_wavSize);
    irs[Upper] = readWav (BinaryData::irupper_wav, BinaryData::irupper_wavSize);
    irs[Pedal] = readWav (BinaryData::irpedal_wav, BinaryData::irpedal_wavSize);
    double e = 0; int n = 0;
    for (auto& b : irs)
        for (int c = 0; c < b.getNumChannels(); ++c) {
            auto* x = b.getReadPointer (c);
            for (int i = 0; i < b.getNumSamples(); ++i) e += (double) x[i] * x[i];
            ++n;
        }
    make = n > 0 && e > 0 ? (float) (0.24 / std::sqrt (e / n)) : 1.0f;
    for (auto& c : echo) c = std::make_unique<juce::dsp::Convolution> (juce::dsp::Convolution::NonUniform { 1024 });
}

bool VoicerProcessor::isBusesLayoutSupported (const BusesLayout& l) const
{
    return l.getMainOutputChannelSet() == juce::AudioChannelSet::stereo() && l.getMainInputChannelSet().isDisabled();
}

void VoicerProcessor::prepareToPlay (double sampleRate, int)
{
    hostRate = sampleRate;
    resample = std::abs (sampleRate - Organ::rate) > 0.5;
    chunk = 512;
    organ.prepare (chunk);
    organ.allOff();
    const juce::dsp::ProcessSpec spec { Organ::rate, (juce::uint32) chunk, 2 };
    for (int p = 0; p < NumParts; ++p) {
        partBuf[(size_t) p].assign ((size_t) chunk, 0.0f);
        echo[(size_t) p]->prepare (spec);
        juce::AudioBuffer<float> copy (irs[(size_t) p]);
        echo[(size_t) p]->loadImpulseResponse (std::move (copy), Organ::rate, juce::dsp::Convolution::Stereo::yes,
                                               juce::dsp::Convolution::Trim::no, juce::dsp::Convolution::Normalise::no);
    }
    wetBuf.setSize (2, chunk);
    tmpBuf.setSize (2, chunk);
    // The app's echo-only EQ: the traced echo has too little early sound in
    // the low bands, which reads as mud.
    *lowShelf.state = *juce::dsp::IIR::Coefficients<float>::makeLowShelf (Organ::rate, 220.0f, juce::MathConstants<float>::sqrt2 / 2.0f, juce::Decibels::decibelsToGain (-5.0f));
    *bump.state = *juce::dsp::IIR::Coefficients<float>::makePeakFilter (Organ::rate, 420.0f, 0.9f, juce::Decibels::decibelsToGain (-2.5f));
    lowShelf.prepare (spec); bump.prepare (spec);
    lowShelf.reset(); bump.reset();
    comp.prepare (spec);
    comp.setThreshold (-10.0f); comp.setRatio (12.0f); comp.setAttack (3.0f); comp.setRelease (250.0f);
    comp.reset();
    limGain = 1.0f;
    for (auto* s : { &wetGain, &dryGain, &outGain }) s->reset (Organ::rate, 0.05);
    const float m = echoParam->load();
    wetGain.setCurrentAndTargetValue (std::sin (m * juce::MathConstants<float>::halfPi));
    dryGain.setCurrentAndTargetValue (std::cos (m * juce::MathConstants<float>::halfPi));
    outGain.setCurrentAndTargetValue (juce::Decibels::decibelsToGain (outParam->load()));

    for (auto& i : interp) i.reset();
    for (auto& f : fifo) f.assign ((size_t) (8 * chunk + 64), 0.0f);
    fifoCount = 0;
    setLatencySamples (0);
}

bool VoicerProcessor::echoReady() const
{
    for (int p = 0; p < NumParts; ++p)
        if (echo[(size_t) p]->getCurrentIRSize() < irs[(size_t) p].getNumSamples()) return false;
    return true;
}

void VoicerProcessor::handleMidi (const juce::MidiMessage& m)
{
    if (m.isNoteOn()) organ.noteOn (m.getNoteNumber());
    else if (m.isNoteOff()) organ.noteOff (m.getNoteNumber());
    else if (m.isAllNotesOff() || m.isAllSoundOff()) organ.allOff();
}

// The organ, its echo and the dynamics, n <= chunk samples at 48 kHz.
void VoicerProcessor::render48 (float* L, float* R, int n)
{
    for (auto& b : partBuf) std::fill (b.begin(), b.begin() + n, 0.0f);
    float* parts[NumParts] = { partBuf[0].data(), partBuf[1].data(), partBuf[2].data() };
    organ.render (parts, n);

    // Echo: each part through its own traced echo, summed, then the EQ.
    wetBuf.setSize (2, n, false, false, true);
    tmpBuf.setSize (2, n, false, false, true);
    wetBuf.clear();
    for (int p = 0; p < NumParts; ++p) {
        tmpBuf.copyFrom (0, 0, parts[p], n);
        tmpBuf.copyFrom (1, 0, parts[p], n);
        juce::dsp::AudioBlock<float> blk (tmpBuf);
        echo[(size_t) p]->process (juce::dsp::ProcessContextReplacing<float> (blk));
        wetBuf.addFrom (0, 0, tmpBuf, 0, 0, n);
        wetBuf.addFrom (1, 0, tmpBuf, 1, 0, n);
    }
    {
        juce::dsp::AudioBlock<float> blk (wetBuf);
        juce::dsp::ProcessContextReplacing<float> ctx (blk);
        lowShelf.process (ctx);
        bump.process (ctx);
    }
    // Dry: the pipes alone, centred, at the same loudness as the echo.
    const float* wl = wetBuf.getReadPointer (0);
    const float* wr = wetBuf.getReadPointer (1);
    for (int i = 0; i < n; ++i) {
        const float dry = 0.24f * (parts[0][i] + parts[1][i] + parts[2][i]);
        const float w = wetGain.getNextValue() * make, d = dryGain.getNextValue();
        L[i] = wl[i] * w + dry * d;
        R[i] = wr[i] * w + dry * d;
    }
    // The app's compressor, then the output level, then a peak ceiling.
    float* ch[2] = { L, R };
    juce::dsp::AudioBlock<float> out (ch, 2, (size_t) n);
    comp.process (juce::dsp::ProcessContextReplacing<float> (out));
    const float ceiling = juce::Decibels::decibelsToGain (-1.0f);
    for (int i = 0; i < n; ++i) {
        const float g = outGain.getNextValue();
        float l = L[i] * g, r = R[i] * g;
        const float pk = std::max (std::abs (l), std::abs (r));
        const float target = pk > ceiling ? ceiling / pk : 1.0f;
        limGain = target < limGain ? target : limGain + (target - limGain) * 0.0002f;
        L[i] = l * limGain;
        R[i] = r * limGain;
    }
}

// Renders n samples at 48 kHz, applying MIDI at its position (scaled from the
// host's sample positions by posScale).
void VoicerProcessor::renderWithMidi48 (float* L, float* R, int n, const juce::MidiBuffer& midi, double posScale)
{
    int done = 0;
    auto it = midi.cbegin();
    while (done < n) {
        while (it != midi.cend() && juce::jmin (n - 1, (int) ((*it).samplePosition * posScale)) <= done) { handleMidi ((*it).getMessage()); ++it; }
        int next = n;
        if (it != midi.cend()) next = juce::jlimit (done + 1, n, (int) ((*it).samplePosition * posScale));
        const int m = juce::jmin (next - done, chunk);
        render48 (L + done, R + done, m);
        done += m;
    }
    for (; it != midi.cend(); ++it) handleMidi ((*it).getMessage());
}

void VoicerProcessor::processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi)
{
    juce::ScopedNoDenormals noDenormals;
    for (int i = 0; i < NumStops; ++i) organ.setStop (i, stopParams[(size_t) i]->load() > 0.5f);
    const float m = echoParam->load();
    wetGain.setTargetValue (std::sin (m * juce::MathConstants<float>::halfPi));
    dryGain.setTargetValue (std::cos (m * juce::MathConstants<float>::halfPi));
    outGain.setTargetValue (juce::Decibels::decibelsToGain (outParam->load()));

    const int n = buffer.getNumSamples();
    keyboard.processNextMidiBuffer (midi, 0, n, true);
    float* L = buffer.getWritePointer (0);
    float* R = buffer.getNumChannels() > 1 ? buffer.getWritePointer (1) : nullptr;
    if (! resample) {
        if (R == nullptr) { tmpBuf.setSize (2, n, false, false, true); R = tmpBuf.getWritePointer (1); }
        renderWithMidi48 (L, R, n, midi, 1.0);
        return;
    }

    // Other host rates: make enough 48 kHz audio, then resample it.
    const double ratio = Organ::rate / hostRate; // input samples per output sample
    const int need = (int) std::ceil (n * ratio) + 4;
    if ((int) fifo[0].size() < need + chunk)
        for (auto& f : fifo) f.resize ((size_t) (need + chunk), 0.0f); // only if the host exceeds its stated block size
    if (fifoCount < need) {
        const int make48 = need - fifoCount;
        renderWithMidi48 (fifo[0].data() + fifoCount, fifo[1].data() + fifoCount, make48, midi, ratio);
        fifoCount += make48;
    } else {
        for (const auto meta : midi) handleMidi (meta.getMessage());
    }
    std::vector<float> scratch;
    float* outs[2] = { L, R };
    int used = 0;
    for (int c = 0; c < 2; ++c) {
        float* dst = outs[c];
        if (dst == nullptr) { scratch.resize ((size_t) n); dst = scratch.data(); }
        used = interp[(size_t) c].process (ratio, fifo[(size_t) c].data(), dst, n);
    }
    used = juce::jmin (used, fifoCount);
    for (auto& f : fifo) std::copy (f.begin() + used, f.begin() + fifoCount, f.begin());
    fifoCount -= used;
}

void VoicerProcessor::getStateInformation (juce::MemoryBlock& dest)
{
    if (auto xml = state.copyState().createXml()) copyXmlToBinary (*xml, dest);
}

void VoicerProcessor::setStateInformation (const void* data, int size)
{
    if (auto xml = getXmlFromBinary (data, size))
        if (xml->hasTagName (state.state.getType())) state.replaceState (juce::ValueTree::fromXml (*xml));
}

juce::AudioProcessorEditor* VoicerProcessor::createEditor() { return new VoicerEditor (*this); }

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() { return new VoicerProcessor(); }
