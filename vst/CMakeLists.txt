cmake_minimum_required(VERSION 3.22)
project(TheVoicer VERSION 0.1.1 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_OSX_DEPLOYMENT_TARGET "11.0" CACHE STRING "")

add_subdirectory(JUCE)

# iPhone: the same organ as a standalone app plus an AUv3 for iOS hosts.
if(CMAKE_SYSTEM_NAME STREQUAL "iOS")
    set(VOICER_FORMATS AUv3 Standalone)
else()
    set(VOICER_FORMATS VST3 AU Standalone)
endif()

juce_add_binary_data(VoicerData SOURCES
    Resources/voiced.json
    Resources/ir-great.wav
    Resources/ir-upper.wav
    Resources/ir-pedal.wav)

juce_add_plugin(TheVoicer
    PRODUCT_NAME "Robot Organ"
    COMPANY_NAME "Birdmania"
    BUNDLE_ID "fyi.birdmania.thevoicer"
    PLUGIN_MANUFACTURER_CODE Bird
    PLUGIN_CODE Vcr1
    FORMATS ${VOICER_FORMATS}
    IS_SYNTH TRUE
    NEEDS_MIDI_INPUT TRUE
    NEEDS_MIDI_OUTPUT FALSE
    IS_MIDI_EFFECT FALSE
    EDITOR_WANTS_KEYBOARD_FOCUS FALSE
    COPY_PLUGIN_AFTER_BUILD FALSE
    VST3_CATEGORIES Instrument Synth
    AU_MAIN_TYPE kAudioUnitType_MusicDevice
    REQUIRES_FULL_SCREEN FALSE
    IPHONE_SCREEN_ORIENTATIONS UIInterfaceOrientationLandscapeLeft UIInterfaceOrientationLandscapeRight
    BACKGROUND_AUDIO_ENABLED TRUE)

target_sources(TheVoicer PRIVATE
    Source/Organ.cpp
    Source/PluginProcessor.cpp
    Source/PluginEditor.cpp)

target_compile_definitions(TheVoicer PUBLIC
    JUCE_WEB_BROWSER=0
    JUCE_USE_CURL=0
    JUCE_VST3_CAN_REPLACE_VST2=0
)

target_link_libraries(TheVoicer
    PRIVATE VoicerData juce::juce_audio_utils juce::juce_audio_formats juce::juce_dsp
    PUBLIC juce::juce_recommended_config_flags juce::juce_recommended_lto_flags juce::juce_recommended_warning_flags)

if(NOT CMAKE_SYSTEM_NAME STREQUAL "iOS")
# Offline tests.
add_executable(pipe_compare test/pipe_compare.cpp)
target_include_directories(pipe_compare PRIVATE Source)

juce_add_console_app(render_test PRODUCT_NAME "render_test")
target_sources(render_test PRIVATE test/render_test.cpp Source/Organ.cpp Source/PluginProcessor.cpp Source/PluginEditor.cpp)
target_compile_definitions(render_test PRIVATE JUCE_WEB_BROWSER=0 JUCE_USE_CURL=0)
target_link_libraries(render_test PRIVATE VoicerData juce::juce_audio_utils juce::juce_audio_formats juce::juce_dsp
    juce::juce_recommended_config_flags juce::juce_recommended_warning_flags)

# JUCE signs before it finishes the bundle (VST3 moduleinfo, resources), so
# re-sign ad hoc last; macOS will not register an AU with a broken signature.
foreach(fmt AU VST3 Standalone)
    add_custom_command(TARGET TheVoicer_${fmt} POST_BUILD
        COMMAND codesign --force --deep -s - "$<TARGET_BUNDLE_DIR:TheVoicer_${fmt}>"
        VERBATIM)
endforeach()
endif()
