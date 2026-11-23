#pragma once
#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_audio_formats/juce_audio_formats.h>
#include <juce_dsp/juce_dsp.h>
#include "Organ.h"

class VoicerProcessor : public juce::AudioProcessor
{
public:
    VoicerProcessor();
    ~VoicerProcessor() override = default;

    void prepareToPlay (double sampleRate, int samplesPerBlock) override;
    void releaseResources() override {}
    bool isBusesLayoutSupported (const BusesLayout&) const override;
    void processBlock (juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }

    const juce::String getName() const override { return "The Voicer"; }
    bool acceptsMidi() const override { return true; }
    bool producesMidi() const override { return false; }
    bool isMidiEffect() const override { return false; }
    double getTailLengthSeconds() const override { return 8.0; }

    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram (int) override {}
    const juce::String getProgramName (int) override { return {}; }
    void changeProgramName (int, const juce::String&) override {}

    void getStateInformation (juce::MemoryBlock&) override;
    void setStateInformation (const void*, int) override;

    // True once all three echoes are loaded (they load on a background thread).
    bool echoReady() const;

    juce::AudioProcessorValueTreeState state;
    static const char* const stopIds[voicer::NumStops];
    static const char* const stopNames[voicer::NumStops];

private:
    static juce::AudioProcessorValueTreeState::ParameterLayout layout();
    void handleMidi (const juce::MidiMessage&);
    void render48 (float* L, float* R, int n); // engine + echo + dynamics at 48 kHz
    void renderWithMidi48 (float* L, float* R, int n, const juce::MidiBuffer&, double posScale);

    voicer::Organ organ;
    std::array<std::unique_ptr<juce::dsp::Convolution>, voicer::NumParts> echo;
    std::array<juce::AudioBuffer<float>, voicer::NumParts> irs;
    using IIR = juce::dsp::ProcessorDuplicator<juce::dsp::IIR::Filter<float>, juce::dsp::IIR::Coefficients<float>>;
    IIR lowShelf, bump;
    juce::dsp::Compressor<float> comp;
    juce::SmoothedValue<float> wetGain, dryGain, outGain;

    std::array<std::vector<float>, voicer::NumParts> partBuf;
    juce::AudioBuffer<float> wetBuf, tmpBuf;
    float limGain = 1.0f;
    float make = 1.0f; // the app's master level: 0.24 / sqrt(echo energy)
    int chunk = 512;

    // Host rates other than 48 kHz: the organ runs at 48 kHz and the result
    // is resampled (windowed sinc).
    double hostRate = 48000.0;
    bool resample = false;
    std::array<juce::WindowedSincInterpolator, 2> interp;
    std::array<std::vector<float>, 2> fifo;
    int fifoCount = 0;

    std::array<std::atomic<float>*, voicer::NumStops> stopParams {};
    std::atomic<float>* echoParam = nullptr;
    std::atomic<float>* outParam = nullptr;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (VoicerProcessor)
};
