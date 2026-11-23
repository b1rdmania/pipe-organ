// Plays a chord through the whole plugin (processBlock) offline and writes it
// to a WAV, with its level. render_test <out.wav> [sampleRate=48000] [block=512]
#include "../Source/PluginProcessor.h"
#include <chrono>
#include <thread>

int main (int argc, char** argv)
{
    juce::ScopedJuceInitialiser_GUI init;
    const juce::File outFile = juce::File::getCurrentWorkingDirectory().getChildFile (argc > 1 ? argv[1] : "out/test.wav");
    const double sr = argc > 2 ? juce::String (argv[2]).getDoubleValue() : 48000.0;
    const int block = argc > 3 ? juce::String (argv[3]).getIntValue() : 512;

    std::unique_ptr<juce::AudioProcessor> plugin (createPluginFilter());
    auto& proc = dynamic_cast<VoicerProcessor&> (*plugin);
    plugin->setPlayConfigDetails (0, 2, sr, block);
    plugin->prepareToPlay (sr, block);

    juce::AudioBuffer<float> buf (2, block);
    juce::MidiBuffer none;
    // The echoes load on a background thread; feed silence until they are in.
    for (int i = 0; i < 2000 && ! proc.echoReady(); ++i) {
        plugin->processBlock (buf, none);
        std::this_thread::sleep_for (std::chrono::milliseconds (5));
    }
    if (! proc.echoReady()) { std::fprintf (stderr, "echo did not load\n"); return 2; }
    plugin->releaseResources();
    plugin->prepareToPlay (sr, block); // start clean, echoes kept
    for (int i = 0; i < 2000 && ! proc.echoReady(); ++i) { plugin->processBlock (buf, none); std::this_thread::sleep_for (std::chrono::milliseconds (5)); }
    for (int i = 0; i < 40; ++i) plugin->processBlock (buf, none); // let the IR crossfade finish

    // D minor, held 3 s with the default stops (Diapason 8', Octave 4', Pedal),
    // then 1.5 s with the Mixture and 16' drawn, then released into the echo.
    const int total = (int) (sr * 10.0);
    const int on = (int) (sr * 0.2), more = (int) (sr * 3.2), off = (int) (sr * 4.7);
    juce::AudioBuffer<float> out (2, total);
    out.clear();
    const int keys[] = { 50, 53, 57, 62 };
    auto t0 = std::chrono::steady_clock::now();
    for (int pos = 0; pos < total; pos += block) {
        const int n = juce::jmin (block, total - pos);
        juce::MidiBuffer midi;
        for (int k : keys) {
            if (on >= pos && on < pos + n) midi.addEvent (juce::MidiMessage::noteOn (1, k, (juce::uint8) 100), on - pos);
            if (off >= pos && off < pos + n) midi.addEvent (juce::MidiMessage::noteOff (1, k), off - pos);
        }
        if (more >= pos && more < pos + n) {
            proc.state.getParameter ("mixture")->setValueNotifyingHost (1.0f);
            proc.state.getParameter ("sixteen")->setValueNotifyingHost (1.0f);
        }
        juce::AudioBuffer<float> b (2, n);
        b.clear();
        plugin->processBlock (b, midi);
        for (int c = 0; c < 2; ++c) out.copyFrom (c, pos, b, c, 0, n);
    }
    const double secs = std::chrono::duration<double> (std::chrono::steady_clock::now() - t0).count();

    double peak = 0, e = 0, eHeld = 0; int over = 0, nans = 0;
    for (int c = 0; c < 2; ++c) {
        auto* x = out.getReadPointer (c);
        for (int i = 0; i < total; ++i) {
            if (! std::isfinite (x[i])) { ++nans; continue; }
            const double a = std::abs (x[i]);
            peak = std::max (peak, a);
            if (a >= 0.999) ++over;
            e += a * a;
            if (i >= (int) (sr * 1.0) && i < more) eHeld += a * a;
        }
    }
    const double rms = std::sqrt (e / (2.0 * total));
    const double rmsHeld = std::sqrt (eHeld / (2.0 * (more - sr * 1.0)));
    std::printf ("rate %.0f Hz, block %d: %.1f s rendered in %.2f s (%.0fx real time)\n", sr, block, total / sr, secs, (total / sr) / secs);
    std::printf ("peak %.4f (%.2f dBFS), rms %.2f dBFS overall, %.2f dBFS while held; samples >= 0.999: %d; non-finite: %d\n",
                 peak, juce::Decibels::gainToDecibels ((float) peak), juce::Decibels::gainToDecibels ((float) rms), juce::Decibels::gainToDecibels ((float) rmsHeld), over, nans);

    outFile.getParentDirectory().createDirectory();
    outFile.deleteFile();
    juce::WavAudioFormat wav;
    std::unique_ptr<juce::OutputStream> os (outFile.createOutputStream());
    auto opts = juce::AudioFormatWriterOptions().withSampleRate (sr).withNumChannels (2).withBitsPerSample (24);
    std::unique_ptr<juce::AudioFormatWriter> w (wav.createWriterFor (os, opts));
    if (w == nullptr) { std::fprintf (stderr, "cannot write %s\n", outFile.getFullPathName().toRawUTF8()); return 2; }
    w->writeFromAudioSampleBuffer (out, 0, total);
    w.reset();
    std::printf ("wrote %s\n", outFile.getFullPathName().toRawUTF8());
    // A picture of the editor, drawn off screen.
    if (argc > 4) {
        std::unique_ptr<juce::AudioProcessorEditor> ed (plugin->createEditorAndMakeActive());
        auto img = ed->createComponentSnapshot (ed->getLocalBounds(), true, 2.0f);
        juce::File png = juce::File::getCurrentWorkingDirectory().getChildFile (argv[4]);
        png.deleteFile();
        juce::FileOutputStream s (png);
        juce::PNGImageFormat().writeImageToStream (img, s);
        std::printf ("wrote %s\n", png.getFullPathName().toRawUTF8());
    }
    const bool silent = peak < 1e-3, clipping = over > 0 || nans > 0;
    return silent || clipping ? 1 : 0;
}
