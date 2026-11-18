// Shared helpers and the single mutable game state for Solmar Heat.
// Every module imports the state object S from here, so no module needs to
// import another gameplay module: the dependency graph stays a flat star.
export const WORLD_W = 3200;
export const WORLD_H = 2400;

// Small deterministic RNG (mulberry32) so the city layout is identical
// every load while still looking hand-placed.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
export const rand = (lo, hi) => lo + Math.random() * (hi - lo);
export const randInt = (lo, hi) => Math.floor(rand(lo, hi + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
export function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export function fmtCash(n) {
  return '$' + Math.floor(n).toLocaleString('en-US');
}
export function fmtClock(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

// The whole live game state. resetState() (in main.js) fills it fresh.
export const S = {
  mode: 'title', // title | playing | paused | wasted | busted | victory
  prevMode: 'playing',
  timeMin: 8 * 60, // clock: minutes since midnight, starts 08:00
  cash: 50,
  missionsDone: 0,
  missionIndex: 0, // 0-based, next mission to play
  mission: null, // active mission runtime object, see missions.js
  missionMsg: '',
  missionMsgT: 0,
  player: null,
  cars: [], // every car: player car, traffic, parked, police cruisers
  peds: [],
  cops: [], // foot police
  bullets: [],
  vipers: [], // mission-5 gang members
  particles: [],
  floats: [], // floating text
  skids: [], // skid marks
  packages: [], // hidden cash packages
  healthPickups: [],
  buildings: [],
  palms: [],
  shops: [], // gun store + spray shop
  vault: null,
  docks: null,
  shake: 0,
  camX: 0,
  camY: 0,
  wantedHeat: 0, // continuous 0..5; stars = floor(heat)
  lastCrimeT: -999,
  arrestT: 0, // seconds a cop has touched the player
  vaultChannel: 0,
  stats: { stolen: 0, kos: 0, packages: 0 },
  shotMode: null, // ?shot=start|play|chase|end staging
  autopilot: false,
  pausedFrom: 'playing',
};

export function wantedStars() {
  return Math.floor(S.wantedHeat);
}
