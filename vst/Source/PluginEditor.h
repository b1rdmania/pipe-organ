#pragma once
#include "PluginProcessor.h"
#include <juce_audio_utils/juce_audio_utils.h>
#include "PipeView.h"

class VoicerLook : public juce::LookAndFeel_V4
{
public:
    VoicerLook();
    juce::Font face (float size, bool bold = false) const;
    void drawButtonBackground (juce::Graphics&, juce::Button&, const juce::Colour&, bool, bool) override;
    void drawButtonText (juce::Graphics&, juce::TextButton&, bool, bool) override;
    void drawRotarySlider (juce::Graphics&, int, int, int, int, float, float, float, juce::Slider&) override;
    juce::Label* createSliderTextBox (juce::Slider&) override;
    juce::Font getLabelFont (juce::Label&) override;
    static const juce::Colour neon, ink, dim, bg;
};

// Keys as the house style has them: white in ink, black in black with a dim
// outline, a pressed key in neon. No shading.
class VoicerKeys : public juce::MidiKeyboardComponent
{
public:
    using MidiKeyboardComponent::MidiKeyboardComponent;
    void drawWhiteNote (int, juce::Graphics&, juce::Rectangle<float>, bool, bool, juce::Colour, juce::Colour) override;
    void drawBlackNote (int, juce::Graphics&, juce::Rectangle<float>, bool, bool, juce::Colour) override;
};

class VoicerEditor : public juce::AudioProcessorEditor
{
public:
    explicit VoicerEditor (VoicerProcessor&);
    ~VoicerEditor() override;
    void paint (juce::Graphics&) override;
    void resized() override;

private:
    void layoutCompact();
    juce::Rectangle<int> safeArea() const;
    VoicerProcessor& proc;
    VoicerLook look;
    std::array<juce::TextButton, voicer::NumStops> stops;
    std::array<std::unique_ptr<juce::AudioProcessorValueTreeState::ButtonAttachment>, voicer::NumStops> stopAtt;
    juce::Slider echo, output;
    juce::Label echoLabel, outputLabel;
    std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment> echoAtt, outputAtt;
    VoicerKeys keys;
    PipeView pipes;
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (VoicerEditor)
};
