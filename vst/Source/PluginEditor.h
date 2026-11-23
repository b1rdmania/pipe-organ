#pragma once
#include "PluginProcessor.h"

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

class VoicerEditor : public juce::AudioProcessorEditor
{
public:
    explicit VoicerEditor (VoicerProcessor&);
    ~VoicerEditor() override;
    void paint (juce::Graphics&) override;
    void resized() override;

private:
    VoicerProcessor& proc;
    VoicerLook look;
    std::array<juce::TextButton, voicer::NumStops> stops;
    std::array<std::unique_ptr<juce::AudioProcessorValueTreeState::ButtonAttachment>, voicer::NumStops> stopAtt;
    juce::Slider echo, output;
    juce::Label echoLabel, outputLabel;
    std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment> echoAtt, outputAtt;
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (VoicerEditor)
};
