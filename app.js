const patchExportURL = "patch.export.json";

const state = {
  context: null,
  device: null,
  output: null,
  analyser: null,
  activeNotes: new Set(),
  params: new Map(),
  midiAccess: null,
  xy: {
    x: 0,
    y: 0.56
  },
  sequencer: {
    steps: [
      { note: 36, active: true },
      { note: 38, active: false },
      { note: 40, active: true },
      { note: 36, active: false },
      { note: 41, active: true },
      { note: 43, active: false },
      { note: 45, active: true },
      { note: 40, active: false },
      { note: 36, active: true },
      { note: 38, active: false },
      { note: 43, active: true },
      { note: 36, active: false },
      { note: 41, active: true },
      { note: 45, active: false },
      { note: 47, active: true },
      { note: 48, active: false }
    ],
    bpm: 120,
    currentStep: -1,
    playing: false,
    timerId: null,
    lastNote: null
  }
};

const noteMap = [
  ["a", 60, "C4", "white"],
  ["w", 61, "C#4", "black"],
  ["s", 62, "D4", "white"],
  ["e", 63, "D#4", "black"],
  ["d", 64, "E4", "white"],
  ["f", 65, "F4", "white"],
  ["t", 66, "F#4", "black"],
  ["g", 67, "G4", "white"],
  ["y", 68, "G#4", "black"],
  ["h", 69, "A4", "white"],
  ["u", 70, "A#4", "black"],
  ["j", 71, "B4", "white"],
  ["k", 72, "C5", "white"],
  ["o", 73, "C#5", "black"],
  ["l", 74, "D5", "white"]
];

const waveformValues = ["sine", "saw", "square", "noise"];
const startButton = document.querySelector("#startButton");
const statusEl = document.querySelector("#deviceStatus");
const engineInfo = document.querySelector("#engineInfo");
const runtimeMessage = document.querySelector("#runtimeMessage");
const keyboardEl = document.querySelector("#keyboard");
const keyboardTab = document.querySelector("#keyboardTab");
const seqTab = document.querySelector("#seqTab");
const keyboardMode = document.querySelector("#keyboardMode");
const sequencerMode = document.querySelector("#sequencerMode");
const xyPad = document.querySelector("#xyPad");
const waveformEl = document.querySelector("#waveformSwitch");
const canvas = document.querySelector("#scopeCanvas");
const canvasContext = canvas.getContext("2d");

const formatters = {
  gain: (value) => value.toFixed(2),
  attack: (value) => `${Math.round(value)} ms`,
  decay: (value) => `${Math.round(value)} ms`,
  sustain: (value) => value.toFixed(2),
  release: (value) => `${Math.round(value)} ms`,
  filter: (value) => `${Math.round(value)} Hz`,
  Q: (value) => value.toFixed(2),
  delaytimeL: (value) => `${Math.round(value)} ms`,
  delaytimeR: (value) => `${Math.round(value)} ms`,
  feedbackL: (value) => value.toFixed(2),
  feedbackR: (value) => value.toFixed(2)
};

function setStatus(text, mode = "") {
  statusEl.textContent = text;
  statusEl.className = `status-pill ${mode}`.trim();
}

function updateEngineInfo() {
  if (!state.context) {
    engineInfo.textContent = "Audio engine --";
    return;
  }
  engineInfo.textContent = `${Math.round(state.context.sampleRate)} Hz / 128f`;
}

function showRuntimeMessage(text) {
  runtimeMessage.textContent = text;
  runtimeMessage.classList.toggle("visible", Boolean(text));
}

function findParameter(id) {
  if (!state.device) return null;
  return state.params.get(id) || null;
}

function setParam(id, value) {
  const parameter = findParameter(id);
  if (!parameter) return;
  parameter.value = Number(value);
  writeParameterSnapshot();
}

function writeParameterSnapshot() {
  if (!state.device) return;
  document.documentElement.dataset.rnboParams = JSON.stringify(
    Object.fromEntries(state.device.parameters.map((parameter) => [parameter.id, parameter.value]))
  );
}

function syncPatchGain() {
  const input = document.querySelector("#gain");
  setParam("gain", input.value);
}

function updateOutput(id, formatter) {
  const input = document.querySelector(`#${id}`);
  const output = document.querySelector(`#${id}Value`);
  if (!input || !output) return;
  output.value = formatter(Number(input.value));
}

function setControlValue(id, value, options = {}) {
  const input = document.querySelector(`#${id}`);
  if (!input) return;
  const min = Number(input.min);
  const max = Number(input.max);
  const numericValue = Math.min(max, Math.max(min, Number(value)));
  input.value = String(numericValue);
  setParam(id, numericValue);

  updateOutput(id, formatters[id]);

  if (!options.skipXY && (id === "filter" || id === "delaytimeL" || id === "delaytimeR")) {
    syncXYFromControls();
  }
}

function bindSlider(id, formatter) {
  const input = document.querySelector(`#${id}`);
  input.addEventListener("input", () => {
    setControlValue(id, input.value);
  });
  updateOutput(id, formatter);
}

function setMode(mode) {
  const tabs = { keyboard: keyboardTab, sequencer: seqTab };
  const panels = { keyboard: keyboardMode, sequencer: sequencerMode };
  Object.entries(tabs).forEach(([key, tab]) => {
    const active = key === mode;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  Object.entries(panels).forEach(([key, panel]) => {
    const active = key === mode;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  });
}

function createWaveformButtons() {
  waveformValues.forEach((label, index) => {
    const button = document.createElement("button");
    button.className = "waveform-button";
    button.type = "button";
    button.textContent = label;
    button.dataset.value = index;
    button.addEventListener("click", () => {
      setWaveform(index);
    });
    waveformEl.appendChild(button);
  });
  setWaveform(1);
}

function setWaveform(index) {
  setParam("waveform", index);
  document.querySelectorAll(".waveform-button").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.value) === index);
  });
}

const SEQ_NOTE_LO = 24;
const SEQ_NOTE_HI = 72;
const SEQ_STEPS = 16;
const SEQ_NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];

const SCALES = {
  chromatic:    [0,1,2,3,4,5,6,7,8,9,10,11],
  major:        [0,2,4,5,7,9,11],
  minor:        [0,2,3,5,7,8,10],
  dorian:       [0,2,3,5,7,9,10],
  phrygian:     [0,1,3,5,7,8,10],
  lydian:       [0,2,4,6,7,9,11],
  mixolydian:   [0,2,4,5,7,9,10],
  locrian:      [0,1,3,5,6,8,10],
  pentatonic:   [0,2,4,7,9],
  minpent:      [0,3,5,7,10],
  blues:        [0,3,5,6,7,10],
  wholetone:    [0,2,4,6,8,10],
  diminished:   [0,2,3,5,6,8,9,11]
};

function getScaleRoot() {
  return Number(document.querySelector("#seqRoot").value);
}

function getScaleName() {
  return document.querySelector("#seqScale").value;
}

function isInScale(midi) {
  const root = getScaleRoot();
  const intervals = SCALES[getScaleName()];
  return intervals.includes((midi - root + 120) % 12);
}

function getScaleNotes(lo, hi) {
  const notes = [];
  for (let m = lo; m <= hi; m++) {
    if (isInScale(m)) notes.push(m);
  }
  return notes;
}

function applyScaleFilter() {
  document.querySelectorAll(".seq-cell").forEach((cell) => {
    const midi = Number(cell.dataset.midi);
    cell.classList.toggle("out-of-scale", !isInScale(midi));
  });
  document.querySelectorAll(".seq-label").forEach((label) => {
    const midi = Number(label.dataset.midi);
    label.classList.toggle("out-of-scale", !isInScale(midi));
  });
}

function randomizePattern() {
  const root = getScaleRoot();
  const baseOctave = 36 + root;
  const scaleNotes = getScaleNotes(baseOctave, baseOctave + 14);
  if (scaleNotes.length === 0) return;

  document.querySelectorAll(".seq-cell.active").forEach((c) => c.classList.remove("active"));

  let prevIdx = Math.floor(scaleNotes.length / 2);

  state.sequencer.steps.forEach((step, i) => {
    const shouldPlay = Math.random() > 0.2;
    if (shouldPlay) {
      const jump = Math.floor(Math.random() * 5) - 2;
      prevIdx = Math.max(0, Math.min(scaleNotes.length - 1, prevIdx + jump));
      step.note = scaleNotes[prevIdx];
      step.active = true;
      const cell = document.querySelector(`.seq-cell[data-step="${i}"][data-midi="${step.note}"]`);
      if (cell) cell.classList.add("active");
    } else {
      step.active = false;
    }
  });

  const grid = document.querySelector("#sequencerGrid");
  const targetRow = grid.querySelector(`.seq-label[data-midi="${scaleNotes[0]}"]`);
  if (targetRow) {
    grid.scrollTop = targetRow.offsetTop - grid.clientHeight / 2;
  }
}

function clearPattern() {
  document.querySelectorAll(".seq-cell.active").forEach((c) => c.classList.remove("active"));
  state.sequencer.steps.forEach((step) => {
    step.active = false;
  });
}

function midiToName(midi) {
  return SEQ_NOTE_NAMES[midi % 12] + Math.floor(midi / 12 - 1);
}

function isBlackKey(midi) {
  return [1,3,6,8,10].includes(midi % 12);
}

function createSequencer() {
  const grid = document.querySelector("#sequencerGrid");
  const totalNotes = SEQ_NOTE_HI - SEQ_NOTE_LO + 1;

  for (let row = SEQ_NOTE_HI; row >= SEQ_NOTE_LO; row--) {
    const label = document.createElement("div");
    const isCNote = row % 12 === 0;
    label.className = "seq-label" + (isBlackKey(row) ? " black" : "") + (isCNote ? " octave-c" : "");
    label.textContent = midiToName(row);
    label.dataset.midi = row;
    grid.appendChild(label);

    for (let col = 0; col < SEQ_STEPS; col++) {
      const cell = document.createElement("div");
      cell.className = "seq-cell" + (isBlackKey(row) ? " black-row" : "");
      cell.dataset.step = col;
      cell.dataset.midi = row;
      if (state.sequencer.steps[col].active && state.sequencer.steps[col].note === row) {
        cell.classList.add("active");
      }
      cell.addEventListener("click", () => toggleCell(col, row, cell));
      grid.appendChild(cell);
    }
  }

  grid.style.setProperty("--seq-rows", totalNotes);

  document.querySelector("#seqBpm").addEventListener("input", (e) => {
    state.sequencer.bpm = Number(e.target.value);
    document.querySelector("#seqBpmValue").value = e.target.value;
    if (state.sequencer.playing) {
      clearInterval(state.sequencer.timerId);
      state.sequencer.timerId = setInterval(sequencerTick, stepDuration());
    }
  });

  document.querySelector("#seqPlay").addEventListener("click", startSequencer);
  document.querySelector("#seqStop").addEventListener("click", stopSequencer);
  document.querySelector("#seqRandom").addEventListener("click", randomizePattern);
  document.querySelector("#seqClear").addEventListener("click", clearPattern);
  document.querySelector("#seqScale").addEventListener("change", applyScaleFilter);
  document.querySelector("#seqRoot").addEventListener("change", applyScaleFilter);

  applyScaleFilter();

  requestAnimationFrame(() => {
    const targetRow = grid.querySelector(`.seq-label[data-midi="36"]`);
    if (targetRow) {
      grid.scrollTop = targetRow.offsetTop - grid.clientHeight / 2;
    }
  });
}

function toggleCell(step, midi, cell) {
  const s = state.sequencer.steps[step];
  if (s.active && s.note === midi) {
    s.active = false;
    cell.classList.remove("active");
  } else {
    document.querySelectorAll(`.seq-cell[data-step="${step}"].active`).forEach((c) => c.classList.remove("active"));
    s.note = midi;
    s.active = true;
    cell.classList.add("active");
  }
}

function updateStepHighlight() {
  document.querySelectorAll(".seq-cell.current").forEach((c) => c.classList.remove("current"));
  if (state.sequencer.currentStep >= 0) {
    document.querySelectorAll(`.seq-cell[data-step="${state.sequencer.currentStep}"]`).forEach((c) => c.classList.add("current"));
  }
}

function stepDuration() {
  return (60000 / state.sequencer.bpm) / 2;
}

async function startSequencer() {
  const seq = state.sequencer;
  if (seq.playing) return;
  await ensureStarted();
  if (seq.timerId) clearInterval(seq.timerId);
  seq.playing = true;
  seq.currentStep = -1;
  document.querySelector("#seqPlay").classList.add("playing");
  document.querySelector("#seqPlay").disabled = true;
  document.querySelector("#seqStop").disabled = false;
  seq.timerId = setInterval(sequencerTick, stepDuration());
}

function stopSequencer() {
  const seq = state.sequencer;
  seq.playing = false;
  if (seq.timerId) { clearInterval(seq.timerId); seq.timerId = null; }
  if (seq.lastNote !== null) {
    stopNote(seq.lastNote);
    seq.lastNote = null;
  }
  setParam("feedbackL", 0);
  setParam("feedbackR", 0);
  setTimeout(() => {
    setControlValue("feedbackL", document.querySelector("#feedbackL").value);
    setControlValue("feedbackR", document.querySelector("#feedbackR").value);
  }, 300);
  updateStepHighlight();
  seq.currentStep = -1;
  document.querySelector("#seqPlay").classList.remove("playing");
  document.querySelector("#seqPlay").disabled = false;
  document.querySelector("#seqStop").disabled = true;
}

function sequencerTick() {
  const seq = state.sequencer;
  if (!seq.playing) return;
  if (seq.lastNote !== null) {
    stopNote(seq.lastNote);
    seq.lastNote = null;
  }
  seq.currentStep = (seq.currentStep + 1) % seq.steps.length;
  const step = seq.steps[seq.currentStep];

  updateStepHighlight();

  if (step.active) {
    playNote(step.note, midiToName(step.note));
    seq.lastNote = step.note;
  }
}

function createKeyboard() {
  const whiteNotes = noteMap.filter((note) => note[3] === "white");
  const whiteLayer = document.createElement("div");
  const blackLayer = document.createElement("div");
  whiteLayer.className = "white-keys";
  blackLayer.className = "black-keys";
  whiteLayer.style.setProperty("--white-count", whiteNotes.length);

  noteMap.forEach(([key, midi, label, color]) => {
    const button = document.createElement("button");
    button.className = `key ${color}`;
    button.type = "button";
    button.dataset.midi = midi;
    button.dataset.key = key;
    button.innerHTML = `<span><strong>${label}</strong><small>${key.toUpperCase()}</small></span>`;
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      playNote(midi, label);
    });
    button.addEventListener("pointerup", () => stopNote(midi));
    button.addEventListener("pointerleave", () => stopNote(midi));
    button.addEventListener("pointercancel", () => stopNote(midi));

    if (color === "black") {
      const previousWhiteIndex = whiteNotes.findIndex((note) => note[1] > midi) - 1;
      const boundaryIndex = Math.max(1, previousWhiteIndex + 1);
      button.style.left = `${(boundaryIndex / whiteNotes.length) * 100}%`;
      blackLayer.appendChild(button);
    } else {
      whiteLayer.appendChild(button);
    }
  });

  keyboardEl.style.setProperty("--white-count", whiteNotes.length);
  keyboardEl.append(whiteLayer, blackLayer);
}

function keyForMidi(midi) {
  return keyboardEl.querySelector(`[data-midi="${midi}"]`);
}

function scheduleMidi(message) {
  if (!state.device || !state.context || !window.RNBO) return;
  const eventTime = state.context.currentTime * 1000;
  const midiEvent = new RNBO.MIDIEvent(eventTime, 0, message);
  state.device.scheduleEvent(midiEvent);
}

function handleMidiMessage(message, label = "") {
  const status = message[0] & 0xf0;
  const midi = message[1];
  const velocity = message[2] || 0;

  if (status === 0x90 && velocity > 0) {
    state.activeNotes.add(midi);
    keyForMidi(midi)?.classList.add("active");
  }

  if (status === 0x80 || (status === 0x90 && velocity === 0)) {
    state.activeNotes.delete(midi);
    keyForMidi(midi)?.classList.remove("active");
  }

  scheduleMidi(message);
}

async function ensureStarted() {
  if (!state.device) {
    await setupAudio();
  }
  if (state.context.state !== "running") {
    await state.context.resume();
  }
}

async function playNote(midi, label = "") {
  await ensureStarted();
  if (state.activeNotes.has(midi)) return;
  handleMidiMessage([0x90, midi, 105], label);
}

function stopNote(midi) {
  if (!state.activeNotes.has(midi)) return;
  handleMidiMessage([0x80, midi, 0]);
}

function shiftPatternOctave(semitones) {
  const canShift = state.sequencer.steps.every((step) => {
    if (!step.active) return true;
    const next = step.note + semitones;
    return next >= SEQ_NOTE_LO && next <= SEQ_NOTE_HI;
  });
  if (!canShift) return;

  document.querySelectorAll(".seq-cell.active").forEach((c) => c.classList.remove("active"));

  state.sequencer.steps.forEach((step) => {
    if (step.active) {
      step.note += semitones;
      const cell = document.querySelector(`.seq-cell[data-step="${state.sequencer.steps.indexOf(step)}"][data-midi="${step.note}"]`);
      if (cell) cell.classList.add("active");
    }
  });

  const grid = document.querySelector("#sequencerGrid");
  const firstActive = state.sequencer.steps.find((s) => s.active);
  if (firstActive) {
    const targetRow = grid.querySelector(`.seq-label[data-midi="${firstActive.note}"]`);
    if (targetRow) {
      grid.scrollTop = targetRow.offsetTop - grid.clientHeight / 2;
    }
  }
}

function interpolate(min, max, normalized) {
  return min + (max - min) * normalized;
}

function normalize(value, min, max) {
  return (value - min) / (max - min);
}

function updateXYReadout() {
  const set = (id, srcId) => {
    const el = document.querySelector(id);
    const src = document.querySelector(srcId);
    if (el && src) el.textContent = src.value;
  };
  set("#xyCutoffValue", "#filterValue");
  set("#xyDelayLValue", "#delaytimeLValue");
  set("#xyQValue", "#QValue");
}

function renderXYPad() {
  xyPad.style.setProperty("--xy-x", state.xy.x);
  xyPad.style.setProperty("--xy-y", state.xy.y);
  const qInput = document.querySelector("#Q");
  const qNorm = qInput ? normalize(Number(qInput.value), Number(qInput.min), Number(qInput.max)) : 0.1;
  const handleSize = 18 + qNorm * 40;
  xyPad.style.setProperty("--handle-size", handleSize + "px");
  updateXYReadout();
}

function applyXYToControls() {
  const filter = document.querySelector("#filter");
  const delayL = document.querySelector("#delaytimeL");
  const delayR = document.querySelector("#delaytimeR");
  const cutoffValue = interpolate(Number(filter.min), Number(filter.max), 1 - state.xy.y);
  const delayLValue = interpolate(Number(delayL.min), Number(delayL.max), state.xy.x);
  const delayRValue = interpolate(Number(delayR.min), Number(delayR.max), state.xy.x);

  const fbValue = interpolate(0, 0.75, state.xy.x);

  setControlValue("filter", cutoffValue, { skipXY: true });
  setControlValue("delaytimeL", delayLValue, { skipXY: true });
  setControlValue("delaytimeR", delayRValue, { skipXY: true });
  setControlValue("feedbackL", fbValue, { skipXY: true });
  setControlValue("feedbackR", fbValue, { skipXY: true });
  renderXYPad();
}

function syncXYFromControls() {
  const filter = document.querySelector("#filter");
  const delayL = document.querySelector("#delaytimeL");
  state.xy.x = normalize(Number(delayL.value), Number(delayL.min), Number(delayL.max));
  state.xy.y = 1 - normalize(Number(filter.value), Number(filter.min), Number(filter.max));
  renderXYPad();
}

function setXYFromPointer(event) {
  const rect = xyPad.getBoundingClientRect();
  state.xy.x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  state.xy.y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
  applyXYToControls();
}

async function setupAudio() {
  if (state.device) return;
  if (window.location.protocol === "file:") {
    throw new Error("RNBO needs a local web server. Open http://127.0.0.1:8080 instead of this file URL.");
  }
  if (!window.RNBO) {
    throw new Error("RNBO library did not load.");
  }

  showRuntimeMessage("");
  setStatus("Loading...");
  startButton.disabled = true;

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  state.context = new AudioContextCtor();
  updateEngineInfo();
  state.output = state.context.createGain();
  state.output.gain.value = 0.9;
  state.analyser = state.context.createAnalyser();
  state.analyser.fftSize = 4096;
  state.analyser.minDecibels = -90;
  state.analyser.maxDecibels = -10;
  state.analyser.connect(state.output);
  state.output.connect(state.context.destination);

  const response = await fetch(patchExportURL);
  const patcher = await response.json();
  state.device = await RNBO.createDevice({ context: state.context, patcher });
  state.device.node.connect(state.analyser);
  state.params = new Map(state.device.parameters.map((parameter) => [parameter.id, parameter]));

  syncParameterControlsFromExport();
  applyCurrentControlsToPatch();
  await setupMidiInput();
  drawScope();

  startButton.textContent = "Audio Ready";
  setStatus("Ready", "ready");
}

function applyCurrentControlsToPatch() {
  const activeWaveform = document.querySelector(".waveform-button.active");
  if (activeWaveform) {
    setParam("waveform", activeWaveform.dataset.value);
  }

  ["gain", "attack", "decay", "sustain", "release", "filter", "Q", "delaytimeL", "delaytimeR", "feedbackL", "feedbackR"].forEach((id) => {
    if (!state.params.has(id)) return;
    setParam(id, document.querySelector(`#${id}`).value);
  });
}

function syncParameterControlsFromExport() {
  const envelopeIds = ["attack", "decay", "sustain", "release"];
  const missingEnvelopeIds = [];

  state.params.forEach((parameter, id) => {
    const input = document.querySelector(`#${id}`);
    if (!input) return;
    input.min = parameter.min;
    input.max = parameter.max;
    if (id !== "gain") {
      input.value = parameter.value;
    }
    updateOutput(id, formatters[id]);
  });

  envelopeIds.forEach((id) => {
    const wrapper = document.querySelector(`.env-control[data-param="${id}"]`);
    const exists = state.params.has(id);
    if (wrapper) wrapper.hidden = !exists;
    if (!exists) missingEnvelopeIds.push(id);
  });

  const status = document.querySelector("#envelopeStatus");
  const visibleEnvelopeIds = envelopeIds.filter((id) => state.params.has(id));
  if (visibleEnvelopeIds.join(",") === "attack,decay") {
    status.textContent = "AD envelope";
  } else if (missingEnvelopeIds.length) {
    status.textContent = visibleEnvelopeIds.length ? visibleEnvelopeIds.join(" / ") : "No envelope";
  } else {
    status.textContent = "ADSR";
  }
}

async function setupMidiInput() {
  if (!navigator.requestMIDIAccess) return;
  try {
    state.midiAccess = await navigator.requestMIDIAccess();
    state.midiAccess.inputs.forEach((input) => {
      input.onmidimessage = (event) => {
        handleMidiMessage(Array.from(event.data));
      };
    });
  } catch {
    // Browser MIDI permission is optional for this test page.
  }
}

function drawScope() {
  if (!state.analyser) return;
  state.analyser.smoothingTimeConstant = 0.7;
  const timeBuf = new Uint8Array(state.analyser.fftSize);
  const freqBuf = new Uint8Array(state.analyser.frequencyBinCount);
  const w = canvas.width;
  const h = canvas.height;

  const render = () => {
    state.analyser.getByteTimeDomainData(timeBuf);
    state.analyser.getByteFrequencyData(freqBuf);

    canvasContext.clearRect(0, 0, w, h);
    canvasContext.fillStyle = "#090a0b";
    canvasContext.fillRect(0, 0, w, h);

    const binCount = freqBuf.length;
    const minFreq = 30;
    const maxFreq = 12000;
    const logMin = Math.log10(minFreq);
    const logMax = Math.log10(maxFreq);
    const logRange = logMax - logMin;
    const nyquist = state.context ? state.context.sampleRate / 2 : 22050;

    const spectrumGrad = canvasContext.createLinearGradient(0, 0, 0, h);
    spectrumGrad.addColorStop(0, "rgba(241, 201, 90, 0.35)");
    spectrumGrad.addColorStop(1, "rgba(79, 209, 176, 0.05)");

    canvasContext.beginPath();
    canvasContext.moveTo(0, h);
    for (let i = 1; i < binCount; i++) {
      const freq = (i / binCount) * nyquist;
      if (freq < minFreq) continue;
      const x = ((Math.log10(freq) - logMin) / logRange) * w;
      const amp = freqBuf[i] / 255;
      const y = h - amp * h * 0.9;
      canvasContext.lineTo(x, y);
    }
    canvasContext.lineTo(w, h);
    canvasContext.closePath();
    canvasContext.fillStyle = spectrumGrad;
    canvasContext.fill();

    canvasContext.beginPath();
    for (let i = 1; i < binCount; i++) {
      const freq = (i / binCount) * nyquist;
      if (freq < minFreq) continue;
      const x = ((Math.log10(freq) - logMin) / logRange) * w;
      const amp = freqBuf[i] / 255;
      const y = h - amp * h * 0.9;
      if (i <= 1 || (i > 1 && ((i - 1) / binCount) * nyquist < minFreq)) {
        canvasContext.moveTo(x, y);
      } else {
        canvasContext.lineTo(x, y);
      }
    }
    canvasContext.strokeStyle = "rgba(241, 201, 90, 0.45)";
    canvasContext.lineWidth = 1.5;
    canvasContext.stroke();

    canvasContext.strokeStyle = "#4fd1b0";
    canvasContext.lineWidth = 2;
    canvasContext.beginPath();
    timeBuf.forEach((value, index) => {
      const x = (index / (timeBuf.length - 1)) * w;
      const y = (value / 255) * h;
      if (index === 0) {
        canvasContext.moveTo(x, y);
      } else {
        canvasContext.lineTo(x, y);
      }
    });
    canvasContext.stroke();

    requestAnimationFrame(render);
  };
  render();
}

startButton.addEventListener("click", async () => {
  try {
    await ensureStarted();
  } catch (error) {
    startButton.disabled = false;
    setStatus("Error", "error");
    showRuntimeMessage(error.message);
    console.error(error);
  }
});

keyboardTab.addEventListener("click", () => setMode("keyboard"));
seqTab.addEventListener("click", () => setMode("sequencer"));

xyPad.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  xyPad.setPointerCapture(event.pointerId);
  setXYFromPointer(event);
});

xyPad.addEventListener("pointermove", (event) => {
  if (!xyPad.hasPointerCapture(event.pointerId)) return;
  setXYFromPointer(event);
});

xyPad.addEventListener("pointerup", (event) => {
  if (xyPad.hasPointerCapture(event.pointerId)) {
    xyPad.releasePointerCapture(event.pointerId);
  }
});

xyPad.addEventListener("wheel", (event) => {
  event.preventDefault();
  const qInput = document.querySelector("#Q");
  if (!qInput) return;
  const step = event.deltaY > 0 ? -0.3 : 0.3;
  const newVal = Math.min(Number(qInput.max), Math.max(Number(qInput.min), Number(qInput.value) + step));
  setControlValue("Q", newVal, { skipXY: true });
  renderXYPad();
}, { passive: false });

window.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  const match = noteMap.find(([key]) => key === event.key.toLowerCase());
  if (!match) return;
  event.preventDefault();
  playNote(match[1], match[2]);
});

window.addEventListener("keyup", (event) => {
  const match = noteMap.find(([key]) => key === event.key.toLowerCase());
  if (!match) return;
  event.preventDefault();
  stopNote(match[1]);
});

createWaveformButtons();
createKeyboard();
createSequencer();
Object.entries(formatters).forEach(([id, formatter]) => bindSlider(id, formatter));
syncXYFromControls();

document.querySelector("#octUp").addEventListener("click", (e) => {
  e.stopPropagation();
  shiftPatternOctave(12);
});
document.querySelector("#octDown").addEventListener("click", (e) => {
  e.stopPropagation();
  shiftPatternOctave(-12);
});

setStatus("Not loaded");
