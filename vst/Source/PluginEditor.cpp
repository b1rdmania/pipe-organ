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

void VoicerKeys::drawWhiteNote (int note, juce::Graphics& g, juce::Rectangle<float> r, bool down, bool over, juce::Colour, juce::Colour)
{
    g.setColour (down ? VoicerLook::neon : (over ? VoicerLook::ink.darker (0.15f) : VoicerLook::ink));
    g.fillRect (r);
    g.setColour (VoicerLook::dim);
    g.drawRect (r, 1.0f);
    if (note % 12 == 0) {
        g.setColour (VoicerLook::dim);
        g.setFont (juce::FontOptions ("Helvetica Neue", 10.0f, juce::Font::plain));
        g.drawText (getWhiteNoteText (note), r.reduced (2.0f, 4.0f), juce::Justification::centredBottom, false);
    }
}

void VoicerKeys::drawBlackNote (int, juce::Graphics& g, juce::Rectangle<float> r, bool down, bool over, juce::Colour)
{
    g.setColour (down ? VoicerLook::neon : (over ? VoicerLook::dim : VoicerLook::bg));
    g.fillRect (r);
    g.setColour (VoicerLook::dim);
    g.drawRect (r, 1.0f);
}

VoicerEditor::VoicerEditor (VoicerProcessor& p)
    : AudioProcessorEditor (p), proc (p),
      keys (p.keyboard, juce::MidiKeyboardComponent::horizontalKeyboard),
      pipes (p.getOrgan(), VoicerLook::neon, VoicerLook::ink, VoicerLook::dim)
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
    // A 61-note manual, C2 to C7. QWERTY plays it once the keys have focus.
    keys.setAvailableRange (36, 96);
    keys.setLowestVisibleKey (36);
    keys.setKeyPressBaseOctave (5);
    keys.setScrollButtonsVisible (false);
    keys.setOctaveForMiddleC (4);
    keys.setColour (juce::MidiKeyboardComponent::whiteNoteColourId, VoicerLook::ink);
    keys.setColour (juce::MidiKeyboardComponent::blackNoteColourId, VoicerLook::bg);
    keys.setColour (juce::MidiKeyboardComponent::keySeparatorLineColourId, VoicerLook::dim);
    keys.setColour (juce::MidiKeyboardComponent::keyDownOverlayColourId, VoicerLook::neon);
    keys.setColour (juce::MidiKeyboardComponent::mouseOverKeyOverlayColourId, VoicerLook::neon.withAlpha (0.25f));
    keys.setColour (juce::MidiKeyboardComponent::shadowColourId, juce::Colours::transparentBlack);
    keys.setColour (juce::MidiKeyboardComponent::upDownButtonBackgroundColourId, VoicerLook::bg);
    addAndMakeVisible (keys);
    addAndMakeVisible (pipes);
   #if JUCE_IOS
    // Phone or AUv3 host: fill whatever space we are given.
    setResizable (true, false);
    setResizeLimits (480, 300, 4000, 4000);
    if (auto* d = juce::Desktop::getInstance().getDisplays().getPrimaryDisplay())
        setSize (d->userArea.getWidth(), d->userArea.getHeight());
    else
        setSize (844, 390);
   #else
    setSize (760, 520);
   #endif
}

VoicerEditor::~VoicerEditor() { setLookAndFeel (nullptr); }

void VoicerEditor::paint (juce::Graphics& g)
{
    g.fillAll (VoicerLook::bg);
    g.setColour (VoicerLook::ink);
    if (getHeight() < 450) {
        auto safe = safeArea();
        g.setFont (look.face (15.0f, true));
        g.drawText ("Robot Organ", safe.getX(), safe.getY(), 200, 22, juce::Justification::left);
        g.setColour (VoicerLook::neon);
        g.fillRect (safe.getX(), safe.getY() + 24, 20, 2);
        return;
    }
    g.setFont (look.face (15.0f, true));
    g.drawText ("Robot Organ", 24, 22, 300, 20, juce::Justification::left);
    g.setColour (VoicerLook::neon);
    g.fillRect (24, 46, 20, 2);
}

void VoicerEditor::resized()
{
    if (getHeight() < 450) { layoutCompact(); return; }
    keys.setScrollButtonsVisible (false);
    keys.setLowestVisibleKey (36);
    auto r = getLocalBounds().reduced (24).withTrimmedTop (48);
    pipes.setBounds (r.removeFromTop (170));
    r.removeFromTop (16);
    auto k = r.removeFromBottom (96);
    keys.setBounds (k);
    keys.setKeyWidth ((float) k.getWidth() / 36.0f); // 36 white keys in five octaves + top C
    r.removeFromBottom (16);
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
    for (auto* l : { &echoLabel, &outputLabel }) l->setVisible (true);
    for (auto* s : { &echo, &output }) s->setTextBoxStyle (juce::Slider::TextBoxBelow, false, 72, 18);
    auto left = knobs.removeFromLeft (100), right = knobs;
    echoLabel.setBounds (left.removeFromTop (18));
    echo.setBounds (left);
    outputLabel.setBounds (right.removeFromTop (18));
    output.setBounds (right);
}

juce::Rectangle<int> VoicerEditor::safeArea() const
{
    auto r = getLocalBounds();
   #if JUCE_IOS
    // Clear the notch / Dynamic Island and the home bar in landscape.
    if (auto* d = juce::Desktop::getInstance().getDisplays().getPrimaryDisplay())
        r = d->safeAreaInsets.subtractedFrom (r);
   #endif
    return r.reduced (12, 8);
}

// Landscape phone: pipes on top, one row of stops with the knobs, then a
// two-octave manual that scrolls. Touch targets stay at 44 pt or more.
void VoicerEditor::layoutCompact()
{
    auto r = safeArea().withTrimmedTop (30);
    auto k = r.removeFromBottom (juce::jmax (110, r.getHeight() * 45 / 100));
    keys.setScrollButtonsVisible (true);
    keys.setBounds (k);
    keys.setKeyWidth ((float) (k.getWidth() - 40) / 15.0f); // two octaves + top C
    keys.setLowestVisibleKey (48);
    r.removeFromBottom (8);
    auto row = r.removeFromBottom (juce::jmax (44, juce::jmin (56, r.getHeight() / 2)));
    r.removeFromBottom (6);
    pipes.setBounds (r);
    auto knobs = row.removeFromRight (row.getHeight() * 2 + 8);
    row.removeFromRight (8);
    const int gap = 6;
    const int bw = (row.getWidth() - gap * (voicer::NumStops - 1)) / voicer::NumStops;
    for (int i = 0; i < voicer::NumStops; ++i)
        stops[(size_t) i].setBounds (row.getX() + i * (bw + gap), row.getY(), bw, row.getHeight());
    for (auto* l : { &echoLabel, &outputLabel }) l->setVisible (false);
    echo.setTextBoxStyle (juce::Slider::NoTextBox, false, 0, 0);
    output.setTextBoxStyle (juce::Slider::NoTextBox, false, 0, 0);
    echo.setBounds (knobs.removeFromLeft (knobs.getWidth() / 2));
    output.setBounds (knobs);
}
