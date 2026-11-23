#include "PluginEditor.h"

const juce::Colour VoicerLook::neon { 0xffff3d6e };
const juce::Colour VoicerLook::ink { 0xfff2f2f2 };
const juce::Colour VoicerLook::dim { 0xff3a3a3a };
const juce::Colour VoicerLook::bg { 0xff000000 };

VoicerLook::VoicerLook()
{
    setColour (juce::ResizableWindow::backgroundColourId, bg);
    setColour (juce::Label::textColourId, ink);
    setColour (juce::Slider::textBoxTextColourId, ink);
    setColour (juce::Slider::textBoxOutlineColourId, juce::Colours::transparentBlack);
}

juce::Font VoicerLook::face (float size, bool bold) const
{
    return juce::Font (juce::FontOptions ("Helvetica Neue", size, bold ? juce::Font::bold : juce::Font::plain));
}

void VoicerLook::drawButtonBackground (juce::Graphics& g, juce::Button& b, const juce::Colour&, bool over, bool)
{
    auto r = b.getLocalBounds().toFloat().reduced (0.5f);
    const bool on = b.getToggleState();
    g.setColour (on ? neon : (over ? ink.withAlpha (0.5f) : dim));
    g.drawRect (r, 1.0f);
    if (on) { g.setColour (neon.withAlpha (0.12f)); g.fillRect (r); }
}

void VoicerLook::drawButtonText (juce::Graphics& g, juce::TextButton& b, bool, bool)
{
    g.setFont (face (14.0f));
    g.setColour (b.getToggleState() ? neon : ink.withAlpha (0.75f));
    g.drawFittedText (b.getButtonText(), b.getLocalBounds().reduced (6, 0), juce::Justification::centred, 1);
}

void VoicerLook::drawRotarySlider (juce::Graphics& g, int x, int y, int w, int h, float pos, float a0, float a1, juce::Slider&)
{
    auto r = juce::Rectangle<float> ((float) x, (float) y, (float) w, (float) h).reduced (6.0f);
    const float rad = juce::jmin (r.getWidth(), r.getHeight()) / 2.0f;
    const auto c = r.getCentre();
    const float a = a0 + pos * (a1 - a0);
    juce::Path track, value;
    track.addCentredArc (c.x, c.y, rad, rad, 0.0f, a0, a1, true);
    value.addCentredArc (c.x, c.y, rad, rad, 0.0f, a0, a, true);
    g.setColour (dim);
    g.strokePath (track, juce::PathStrokeType (2.0f, juce::PathStrokeType::curved, juce::PathStrokeType::butt));
    g.setColour (neon);
    g.strokePath (value, juce::PathStrokeType (2.0f, juce::PathStrokeType::curved, juce::PathStrokeType::butt));
    const juce::Point<float> tip (c.x + (rad - 8.0f) * std::sin (a), c.y - (rad - 8.0f) * std::cos (a));
    g.setColour (ink);
    g.drawLine ({ c.getPointOnCircumference (rad * 0.25f, a), tip }, 1.5f);
}

juce::Font VoicerLook::getLabelFont (juce::Label& l)
{
    return face (l.getFont().getHeight());
}

juce::Label* VoicerLook::createSliderTextBox (juce::Slider& s)
{
    auto* l = LookAndFeel_V4::createSliderTextBox (s);
    l->setFont (face (12.0f));
    l->setColour (juce::Label::textColourId, ink.withAlpha (0.6f));
    l->setColour (juce::Label::backgroundColourId, juce::Colours::transparentBlack);
    l->setColour (juce::Label::outlineColourId, juce::Colours::transparentBlack);
    return l;
}

VoicerEditor::VoicerEditor (VoicerProcessor& p) : AudioProcessorEditor (p), proc (p)
{
    setLookAndFeel (&look);
    for (int i = 0; i < voicer::NumStops; ++i) {
        auto& b = stops[(size_t) i];
        b.setButtonText (juce::String::fromUTF8 (VoicerProcessor::stopNames[i]));
        b.setClickingTogglesState (true);
        addAndMakeVisible (b);
        stopAtt[(size_t) i] = std::make_unique<juce::AudioProcessorValueTreeState::ButtonAttachment> (proc.state, VoicerProcessor::stopIds[i], b);
    }
    for (auto* s : { &echo, &output }) {
        s->setSliderStyle (juce::Slider::RotaryHorizontalVerticalDrag);
        s->setTextBoxStyle (juce::Slider::TextBoxBelow, false, 72, 18);
        s->setColour (juce::Slider::textBoxOutlineColourId, juce::Colours::transparentBlack);
        s->setColour (juce::Slider::textBoxBackgroundColourId, juce::Colours::transparentBlack);
        addAndMakeVisible (*s);
    }
    echoAtt = std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment> (proc.state, "echo", echo);
    outputAtt = std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment> (proc.state, "output", output);
    for (auto [l, t] : { std::pair { &echoLabel, "Echo" }, std::pair { &outputLabel, "Output" } }) {
        l->setText (t, juce::dontSendNotification);
        l->setFont (look.face (13.0f));
        l->setJustificationType (juce::Justification::centred);
        addAndMakeVisible (*l);
    }
    setSize (640, 260);
}

VoicerEditor::~VoicerEditor() { setLookAndFeel (nullptr); }

void VoicerEditor::paint (juce::Graphics& g)
{
    g.fillAll (VoicerLook::bg);
    g.setColour (VoicerLook::ink);
    g.setFont (look.face (20.0f, true));
    g.drawText ("The Voicer", 24, 20, 300, 26, juce::Justification::left);
    g.setColour (VoicerLook::neon);
    g.fillRect (24, 52, 28, 2);
}

void VoicerEditor::resized()
{
    auto r = getLocalBounds().reduced (24).withTrimmedTop (48);
    auto knobs = r.removeFromRight (200);
    r.removeFromRight (16);
    // Stops: four on the first row, three on the second.
    const int gap = 8, rows = 2, perRow = 4;
    const int bh = (r.getHeight() - gap * (rows - 1)) / rows;
    const int bw = (r.getWidth() - gap * (perRow - 1)) / perRow;
    for (int i = 0; i < voicer::NumStops; ++i) {
        const int row = i / perRow, col = i % perRow;
        stops[(size_t) i].setBounds (r.getX() + col * (bw + gap), r.getY() + row * (bh + gap), bw, bh);
    }
    auto left = knobs.removeFromLeft (100), right = knobs;
    echoLabel.setBounds (left.removeFromTop (18));
    echo.setBounds (left);
    outputLabel.setBounds (right.removeFromTop (18));
    output.setBounds (right);
}
