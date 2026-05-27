# Synth ARP — RNBO Web Synth

A browser-based synthesizer built with Max/MSP RNBO Web Export. Features a playable keyboard, scale-locked step sequencer, XY performance pad, and real-time spectrum visualizer.

Built by [Po-Hao Chi](https://chipohao.com) / [ZoneSound Creative](https://zonesoundcreative.com)

## Features

### Performance Modes
- **Keyboard** — screen keyboard + computer key input (A W S E D F T G Y H U J K O L), external MIDI auto-detected
- **Sequencer** (default) — 16-step piano roll with scale quantization, randomizer, and octave shift

### Synth Engine (RNBO)
- **Oscillator** — sine, saw, square, noise waveform selector
- **Envelope** — ADSR (attack, decay, sustain, release)
- **Filter** — lowpass with cutoff (30–10000 Hz) and resonance (Q)
- **Stereo Delay** — independent L/R delay time with feedback

### XY Pad (always visible)
- **X axis** — delay time + feedback depth
- **Y axis** — filter cutoff
- **Scroll / trackpad** — filter resonance (Q), visualized as handle size
- Hover the handle for control hints
- Available in both Keyboard and Sequencer modes

### Sequencer
- 16-step piano roll, C1–C5 range
- 13 scale modes: Chromatic, Major, Minor, Dorian, Phrygian, Lydian, Mixolydian, Locrian, Pentatonic, Minor Pentatonic, Blues, Whole Tone, Diminished
- Selectable root note (C–B)
- **Random** — generates patterns within the selected scale, concentrated in a 1-octave range with stepwise motion
- **Clear** — reset all steps
- **Octave shift** (+/- buttons) — moves all placed notes up or down one octave
- Collapsible piano roll (click "Piano Roll" to fold/unfold)
- BPM control (60–240)

### Visualizer
- Real-time waveform scope (green line)
- FFT spectrum overlay (log frequency scale, 30–12000 Hz), shows filter effect in real time

## Files

| File | Purpose |
|------|---------|
| `index.html` | Main web page |
| `styles.css` | Interface styling (dark theme) |
| `app.js` | RNBO loading, MIDI, keyboard, sequencer, XY pad, spectrum |
| `patch.export.json` | RNBO Web Export (WebAssembly) |
| `rnbo_demo_0526.maxpat` | Max parent patch |
| `simpleSynthDel.rnbopat` | RNBO subpatch source |

## Run Locally

Requires a local web server (WebAssembly and AudioWorklet don't work with `file://`).

```bash
npx http-server -p 8080
```

Open http://127.0.0.1:8080

## Tech Stack

- **Audio engine**: [RNBO](https://rnbo.cycling74.com/) by Cycling '74 — Max patch compiled to WebAssembly
- **Audio runtime**: `@rnbo/js` + Web Audio API (AudioWorkletNode)
- **Frontend**: vanilla HTML/CSS/JS, no framework
- **Spectrum**: Web Audio AnalyserNode, log-scale FFT rendering on canvas

## License

RNBO export subject to [Cycling '74 RNBO license](https://cycling74.com/products/rnbo).
