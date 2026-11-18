// Solmar Heat — game loop, states, camera, rendering, save wiring,
// the playtest debug hook, and the ?shot= staging states for screenshots.
import { S, clamp, lerp, dist, WORLD_W, WORLD_H } from './util.js';
import { initAudio, updateAudio, setMuted, isMuted } from './audio.js';
import { initInput, keyDown, keyPressed, endFrame, mouse } from './input.js';
import { buildCity, drawCity, districtAt } from './city.js';
import { createPlayer, updatePlayer, drawPlayer, healPlayer } from './player.js';
import { spawnTraffic, updateVehicles, drawCars, makeCar } from './vehicles.js';
import { spawnPedestrians, updatePedestrians, drawPedestrians } from './pedestrians.js';
import { updateWanted, updatePolice, drawPolice } from './police.js';
import { updateBullets, updateVipers, drawBullets, drawVipers, spawnAmmoPickups, updateAmmoPickups, drawAmmoPickups } from './combat.js';
import { startMission, updateMissions, drawMissionMarker, drawObjectiveArrow, failMission, MISSIONS } from './missions.js';
import { initHud, updateHud, showScreen } from './hud.js';
import { saveGame, loadSave, clearSave } from './save.js';
import { updateFx, drawFx, addShake } from './fx.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let lastT = 0;
let titlePan = 0;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// --- game setup -----------------------------------------------------------
export function resetGame(save) {
  buildCity();
  S.cars = [];
  S.peds = [];
  S.cops = [];
  S.bullets = [];
  S.vipers = [];
  S.particles = [];
  S.floats = [];
  S.skids = [];
  S.healthPickups = [];
  S.wantedHeat = 0;
  S.lastCrimeT = -999;
  S.arrestT = 0;
  S.vaultChannel = 0;
  S.mission = null;
  S.briefing = null;
  S.missionMsg = '';
  S.missionMsgT = 0;
  S.shopOpen = null;
  S.shake = 0;
  S.autopilot = false;
  S.stats = { stolen: 0, kos: 0, packages: 0 };
  S.timeMin = save ? save.timeMin : 8 * 60;
  S.cash = save ? save.cash : 50;
  S.missionsDone = save ? save.missionsDone : 0;
  S.missionIndex = save ? save.missionIndex : 0;
  const px = save ? save.x : 1600;
  const py = save ? save.y : 1450;
  S.player = createPlayer(px, py);
  if (save) {
    S.player.hp = save.hp;
    S.player.hasPistol = save.hasPistol;
    S.player.ammo = save.ammo;
    if (save.packages) {
      for (let i = 0; i < Math.min(save.packages, S.packages.length); i++) S.packages[i].taken = true;
    }
  }
  // A starter car parked nearby so the first minutes are not all on foot.
  const starter = makeCar('sedan', 1680, 1450, 0, 'parked');
  S.cars.push(starter);
  spawnTraffic(14);
  spawnPedestrians(24);
  spawnAmmoPickups();
  S.camX = clamp(px - canvas.width / 2, 0, WORLD_W - canvas.width);
  S.camY = clamp(py - canvas.height / 2, 0, WORLD_H - canvas.height);
}

function newGame() {
  clearSave();
  resetGame(null);
  S.mode = 'playing';
  showScreen('playing');
  startMission(0);
}

function continueGame() {
  const save = loadSave();
  if (!save) { newGame(); return; }
  resetGame(save);
  S.mode = 'playing';
  showScreen('playing');
  S.missionMsg = 'Welcome back, Rex. Mission ' + (S.missionIndex + 1) + ' is waiting — press Enter.';
  S.missionMsgT = 6;
}

function toTitle() {
  S.mode = 'title';
  showScreen('title');
}

function retryAfterDeath() {
  // A retry wipes heat to zero, which would silently finish any escape
  // still running — so a death or bust mid-escape fails that mission
  // first, instead of handing the player a getaway they did not survive.
  const active = S.mission;
  const midEscape = active && (active.kind === 'getaway'
    || (active.kind === 'vault' && active.stage === 'escape'));
  if (midEscape) failMission('Died during the escape — mission failed');
  const p = S.player;
  p.hp = p.maxHp;
  p.x = 1600;
  p.y = 1450;
  if (p.car) { p.car.driver = 'none'; p.car = null; }
  p.onFoot = true;
  S.cops = [];
  S.wantedHeat = 0;
  S.mode = 'playing';
  showScreen('playing');
}

function freeRoam() {
  S.mode = 'playing';
  showScreen('playing');
}

// --- debug hook (playtesting only; no effect on normal play) --------------
window.SH = {
  state: S,
  debug: {
    setCash(n) { S.cash = n; },
    setWanted(n) { S.wantedHeat = clamp(n, 0, 5); },
    completeMission() { if (S.mission) { S.missionsDone++; S.missionIndex++; S.mission = null; } },
    teleport(x, y) { S.player.x = x; S.player.y = y; },
    givePistol() { S.player.hasPistol = true; S.player.ammo = 120; },
    startMission(i) { startMission(i); },
  },
  newGame, continueGame, resumeGame, toTitle, retryAfterDeath, freeRoam,
};

function resumeGame() {
  S.mode = 'playing';
  showScreen('playing');
}

// --- ?shot= staging for screenshots ---------------------------------------
function stageShot(name) {
  S.shotMode = name;
  if (name === 'start') {
    resetGame(null);
    S.mode = 'title';
    showScreen('title');
    return;
  }
  if (name === 'end') {
    resetGame(null);
    S.cash = 3250;
    S.missionsDone = 6;
    S.missionIndex = 6;
    S.mode = 'victory';
    showScreen('victory');
    return;
  }
  // play / chase: a live driving scene with a mission and wanted level.
  resetGame(null);
  S.mode = 'playing';
  showScreen('playing');
  const car = makeCar('sports', S.player.x + 60, S.player.y, 0, 'player');
  S.player.onFoot = false;
  S.player.car = car;
  car.speed = 180;
  S.cars.push(car);
  if (name === 'chase') {
    S.wantedHeat = 3.5; // 3 stars (a little over 3 so decay does not drop a star instantly)
    startMission(3); // getaway
  } else {
    S.wantedHeat = 2.5; // 2 stars (a little over 2 so decay does not drop a star instantly)
    startMission(1); // delivery run
  }
  S.autopilot = true;
}

// --- main loop --------------------------------------------------------------
function update(dt) {
  const p = S.player;
  // Global keys.
  if (keyPressed('m')) setMuted(!isMuted());
  if (S.mode === 'title') {
    titlePan += dt * 24;
    if (keyPressed('enter')) newGame();
    return;
  }
  if (S.mode === 'victory') {
    if (keyPressed('enter')) freeRoam();
    return;
  }
  if (S.mode === 'wasted' || S.mode === 'busted') {
    if (keyPressed('enter')) retryAfterDeath();
    return;
  }
  if (keyPressed('p') || keyPressed('escape')) {
    if (S.shopOpen) {
      S.shopOpen = null;
    } else if (S.mode === 'playing') {
      S.mode = 'paused';
      showScreen('paused');
    } else if (S.mode === 'paused') {
      resumeGame();
    }
    return;
  }
  if (S.mode === 'paused') return;
  if (S.mode !== 'playing') return;

  // Clock: one game hour per two real minutes.
  S.timeMin = (S.timeMin + dt * 0.5) % (24 * 60);
  // Slow health regen while alive and out of combat for a while.
  if (p.hp > 0 && p.hp < p.maxHp && p.hurtT <= 0) healPlayer(1.6 * dt);

  updatePlayer(dt);
  updateVehicles(dt);
  updatePedestrians(dt);
  updateWanted(dt);
  updatePolice(dt);
  updateBullets(dt);
  updateVipers(dt);
  updateAmmoPickups();
  updateMissions(dt);
  updateFx(dt);
  updateAudio(dt, p.car && !p.onFoot ? Math.abs(p.car.speed) : p.speed, Math.floor(S.wantedHeat));

  // Start the next mission with Enter when free roaming.
  if (!S.mission && S.missionsDone < 6 && keyPressed('enter')) {
    startMission(S.missionIndex);
  }

  // Camera follows the player smoothly.
  const tx = clamp(p.x - canvas.width / 2, 0, Math.max(0, WORLD_W - canvas.width));
  const ty = clamp(p.y - canvas.height / 2, 0, Math.max(0, WORLD_H - canvas.height));
  S.camX = lerp(S.camX, tx, 1 - Math.pow(0.001, dt));
  S.camY = lerp(S.camY, ty, 1 - Math.pow(0.001, dt));
}

function render() {
  const vw = canvas.width;
  const vh = canvas.height;
  ctx.fillStyle = '#111111';
  ctx.fillRect(0, 0, vw, vh);
  let camX = S.camX;
  let camY = S.camY;
  if (S.mode === 'title') {
    // Slow pan across downtown behind the title screen.
    camX = 1200 + Math.sin(titlePan * 0.05) * 300;
    camY = 700 + Math.cos(titlePan * 0.03) * 150;
  }
  const shX = S.shake > 0 ? (Math.random() - 0.5) * S.shake : 0;
  const shY = S.shake > 0 ? (Math.random() - 0.5) * S.shake : 0;
  ctx.save();
  ctx.translate(-camX + shX, -camY + shY);
  drawCity(ctx, camX, camY, vw, vh);
  drawFx(ctx, camX, camY);
  drawMissionMarker(ctx);
  drawAmmoPickups(ctx);
  drawCars(ctx);
  drawPedestrians(ctx);
  drawPolice(ctx);
  drawVipers(ctx);
  drawPlayer(ctx);
  drawBullets(ctx);
  ctx.restore();
  // Warm day light + vignette (screen space).
  const warm = ctx.createLinearGradient(0, 0, 0, vh);
  warm.addColorStop(0, 'rgba(255,214,140,0.10)');
  warm.addColorStop(1, 'rgba(255,170,90,0.05)');
  ctx.fillStyle = warm;
  ctx.fillRect(0, 0, vw, vh);
  const vg = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.45, vw / 2, vh / 2, Math.max(vw, vh) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, vw, vh);
  if (S.mode === 'playing' || S.mode === 'paused') {
    drawObjectiveArrow(ctx, vw, vh);
  }
}

function frame(t) {
  const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
  lastT = t;
  update(dt);
  render();
  if (S.mode === 'playing' || S.mode === 'paused' || S.mode === 'title') updateHud();
  endFrame();
  requestAnimationFrame(frame);
}

// --- boot -------------------------------------------------------------------
initInput(canvas);
initHud();
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
if (shot) {
  stageShot(shot);
} else {
  resetGame(null);
  S.mode = 'title';
  showScreen('title');
}
// First user gesture unlocks audio.
window.addEventListener('pointerdown', initAudio, { once: true });
window.addEventListener('keydown', initAudio, { once: true });
requestAnimationFrame(frame);
