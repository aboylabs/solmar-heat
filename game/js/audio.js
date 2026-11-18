// All sound is synthesized with WebAudio: no audio files, no network.
// Engine hum follows speed, siren is two-tone, gunshots are filtered noise.
let ctx = null;
let master = null;
let muted = false;
let engineOsc = null;
let engineGain = null;
let sirenOsc = null;
let sirenGain = null;
let sirenTimer = 0;
let sirenHigh = false;
let musicTimer = null;
let musicStep = 0;

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    // Engine: a low sawtooth whose pitch follows driving speed.
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineOsc.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
    // Siren: a sine that alternates two tones.
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'sine';
    sirenOsc.frequency.value = 720;
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain);
    sirenGain.connect(master);
    sirenOsc.start();
    startMusic();
  } catch (e) {
    ctx = null;
  }
}

export function setMuted(m) {
  muted = m;
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.5, ctx.currentTime, 0.05);
}
export function isMuted() { return muted; }

function noiseBuffer(dur) {
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function blip(freq, dur, type, vol, slideTo) {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

export function playGunshot() {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(0.14);
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 0.8;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.9, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t);
}

export function playPunch() {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(0.09);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 320;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.8, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t);
  blip(90, 0.08, 'sine', 0.5, 50);
}

export function playPickup() { blip(660, 0.12, 'sine', 0.4, 990); }
export function playChime() { blip(523, 0.1, 'triangle', 0.35); setTimeout(() => blip(784, 0.16, 'triangle', 0.35), 90); }
export function playClick() { blip(440, 0.05, 'square', 0.15); }
export function playError() { blip(180, 0.18, 'square', 0.25, 120); }
export function playCrash() {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(0.2);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 500;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.7, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t);
}
export function playJingle() {
  [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => blip(f, 0.22, 'triangle', 0.4), i * 130));
}
export function playWasted() {
  [392, 330, 262, 196].forEach((f, i) => setTimeout(() => blip(f, 0.3, 'triangle', 0.35), i * 180));
}

// Simple warm bass loop: a laid-back I–VI–IV–V pattern, one note per beat.
const BASSLINE = [55, 55, 65.41, 49, 55, 55, 65.41, 73.42];
function startMusic() {
  if (musicTimer) return;
  musicTimer = setInterval(() => {
    if (!ctx || muted || musicStep === null) return;
    const note = BASSLINE[musicStep % BASSLINE.length];
    musicStep++;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = note;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + 0.45);
  }, 460);
}

// Called every frame: engine pitch from speed, siren while wanted.
export function updateAudio(dt, speed, wanted) {
  if (!ctx) return;
  const t = ctx.currentTime;
  if (engineOsc && engineGain) {
    const target = speed > 4 ? 0.05 + Math.min(0.12, speed / 2600) : 0;
    engineGain.gain.setTargetAtTime(target, t, 0.1);
    engineOsc.frequency.setTargetAtTime(50 + speed * 0.55, t, 0.08);
  }
  if (sirenOsc && sirenGain) {
    const on = wanted >= 1;
    sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, t, 0.2);
    if (on) {
      sirenTimer += dt;
      if (sirenTimer > 0.42) {
        sirenTimer = 0;
        sirenHigh = !sirenHigh;
        sirenOsc.frequency.setTargetAtTime(sirenHigh ? 950 : 700, t, 0.05);
      }
    }
  }
}
