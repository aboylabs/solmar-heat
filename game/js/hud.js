// HUD, minimap, overlay screens (title / pause / wasted / busted / victory),
// the mission briefing box, and the shop menus.
import { S, fmtCash, fmtClock, wantedStars, WORLD_W, WORLD_H } from './util.js';
import { districtAt } from './city.js';
import { MISSIONS } from './missions.js';
import { saveGame, hasSave } from './save.js';
import { playClick, playError, playChime } from './audio.js';
import { addFloatText } from './fx.js';

const $ = (id) => document.getElementById(id);

let minimapCtx = null;
let lastShop = null; // which shop menu is currently rendered (null = none)

export function initHud() {
  minimapCtx = $('minimap').getContext('2d');
  $('btn-new').addEventListener('click', () => window.SH.newGame());
  $('btn-continue').addEventListener('click', () => window.SH.continueGame());
  $('btn-resume').addEventListener('click', () => window.SH.resumeGame());
  $('btn-save').addEventListener('click', () => {
    if (saveGame()) { $('save-note').textContent = 'Saved!'; playChime(); }
    else $('save-note').textContent = 'Save failed.';
  });
  $('btn-restart').addEventListener('click', () => window.SH.newGame());
  $('btn-quit-title').addEventListener('click', () => window.SH.toTitle());
  $('btn-retry-wasted').addEventListener('click', () => window.SH.retryAfterDeath());
  $('btn-retry-busted').addEventListener('click', () => window.SH.retryAfterDeath());
  $('btn-free-roam').addEventListener('click', () => window.SH.freeRoam());
  $('shop-close').addEventListener('click', () => { S.shopOpen = null; playClick(); });
  $('shop-items').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-buy]');
    if (btn) buyItem(btn.dataset.buy);
  });
}

function buyItem(kind) {
  const p = S.player;
  if (!p) return;
  if (kind === 'pistol') {
    if (p.hasPistol) { playError(); return; }
    if (S.cash < 300) { playError(); return; }
    S.cash -= 300;
    p.hasPistol = true;
    p.ammo += 12;
    addFloatText(p.x, p.y - 30, 'Pistol bought!', '#2ecc71');
    playChime();
  } else if (kind === 'ammo') {
    if (!p.hasPistol) { playError(); return; }
    if (S.cash < 50) { playError(); return; }
    S.cash -= 50;
    p.ammo += 12;
    addFloatText(p.x, p.y - 30, '+12 ammo', '#2ecc71');
    playChime();
  } else if (kind === 'spray') {
    if (S.cash < 150) { playError(); return; }
    S.cash -= 150;
    if (p.car && !p.car.dead) { p.car.hp = p.car.maxHp; }
    S.wantedHeat = Math.max(0, S.wantedHeat - 1);
    addFloatText(p.x, p.y - 30, 'Fresh paint, heat down!', '#2ecc71');
    playChime();
  }
  lastShop = null; // force the menu to re-render (owned state may change)
  renderShop();
}

function renderShop() {
  const kind = S.shopOpen;
  if (!kind) {
    if (lastShop !== null) { $('shop').classList.add('hidden'); lastShop = null; }
    return;
  }
  if (kind === lastShop) return; // rebuild only when the shop opens or changes
  lastShop = kind;
  $('shop').classList.remove('hidden');
  const p = S.player;
  if (kind === 'gun') {
    $('shop-title').textContent = 'Ironworks Arms — Gun Store';
    $('shop-items').innerHTML =
      '<button data-buy="pistol">Pistol — $300' + (p.hasPistol ? ' (owned)' : '') + '</button>' +
      '<button data-buy="ammo">Ammo box (+12) — $50</button>' +
      '<p class="shop-note">Press E near the door to shop. Esc closes.</p>';
  } else {
    $('shop-title').textContent = 'Solmar Spray Shop';
    $('shop-items').innerHTML =
      '<button data-buy="spray">Respray — $150 (repair car, −1 star)</button>' +
      '<p class="shop-note">Press E near the door to shop. Esc closes.</p>';
  }
}

export function updateHud() {
  const p = S.player;
  if (!p) return;
  $('hp-fill').style.width = Math.max(0, p.hp) + '%';
  $('hp-fill').style.background = p.hp > 50 ? '#2ecc71' : p.hp > 25 ? '#f39c12' : '#e74c3c';
  $('hp-text').textContent = Math.ceil(p.hp) + ' HP';
  $('cash').textContent = fmtCash(S.cash);
  $('clock').textContent = fmtClock(S.timeMin);
  $('district').textContent = districtAt(p.x, p.y);
  const stars = wantedStars();
  $('stars').textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars);
  $('stars').style.color = stars >= 3 ? '#ff4444' : '#ffd640';
  // Objective line.
  const m = S.mission;
  if (m) {
    let txt = 'Mission ' + m.def.id + ' — ' + m.def.name + ': ' + m.def.objective;
    if (m.kind === 'delivery') txt += '  [' + Math.ceil(m.timer) + 's]';
    if (m.kind === 'vault' && m.stage === 'channel') txt += '  [' + S.vaultChannel.toFixed(1) + 's / 5s]';
    if (m.kind === 'shootout' && m.stage === 'fight') txt += '  [Vipers left: ' + m.vipersLeft + ']';
    $('objective').textContent = txt;
  } else if (S.missionsDone >= 6) {
    $('objective').textContent = 'All missions complete — free roam! Find the 10 hidden cash packages.';
  } else {
    $('objective').textContent = 'Free roam — press Enter to start Mission ' + (S.missionIndex + 1) + ': ' + MISSIONS[S.missionIndex].name;
  }
  // Speed while driving.
  if (!p.onFoot && p.car) {
    $('speed').classList.remove('hidden');
    $('speed').textContent = Math.round(Math.abs(p.car.speed) * 0.36) + ' km/h';
  } else {
    $('speed').classList.add('hidden');
  }
  // Weapon line.
  $('ammo').textContent = p.hasPistol ? ('Pistol  •  Ammo ' + p.ammo) : 'Fists — buy a pistol at Ironworks Arms';
  // Mission message toast.
  if (S.missionMsgT > 0 && S.missionMsg) {
    $('msg').textContent = S.missionMsg;
    $('msg').classList.remove('hidden');
  } else {
    $('msg').classList.add('hidden');
  }
  // Briefing box.
  if (S.briefing) {
    $('briefing').classList.remove('hidden');
    $('brief-title').textContent = S.briefing.title;
    $('brief-text').textContent = S.briefing.text;
  } else {
    $('briefing').classList.add('hidden');
  }
  // Shop menu.
  renderShop();
  // Pause mission list.
  if (S.mode === 'paused') {
    $('mission-list').innerHTML = MISSIONS.map((d, i) => {
      const state = i < S.missionsDone ? '✓ Done' : i === S.missionIndex ? '▶ Current' : 'Locked';
      return '<li><b>' + d.id + '. ' + d.name + '</b> — ' + state + ' — ' + fmtCash(d.reward) + '</li>';
    }).join('');
  }
  drawMinimap();
}

export function drawMinimap() {
  if (!minimapCtx) return;
  const ctx = minimapCtx;
  const W = 220;
  const H = 165;
  const sx = W / WORLD_W;
  const sy = H / WORLD_H;
  ctx.fillStyle = '#1c2b33';
  ctx.fillRect(0, 0, W, H);
  // Sea + beach.
  ctx.fillStyle = '#3fc4c8';
  ctx.fillRect(3080 * sx, 0, W - 3080 * sx, H);
  ctx.fillStyle = '#f4e3b0';
  ctx.fillRect(2920 * sx, 0, (3080 - 2920) * sx, H);
  // Roads.
  ctx.fillStyle = '#5a564f';
  const roadsV = [400, 1000, 1600, 2200, 2800];
  const roadsH = [400, 900, 1400, 1900];
  for (const vx of roadsV) ctx.fillRect(vx * sx - 2, 0, 4, H);
  for (const hy of roadsH) ctx.fillRect(0, hy * sy - 2, W, 4);
  // Mission marker (yellow).
  const m = S.mission;
  if (m && m.target) {
    ctx.fillStyle = '#ffd640';
    ctx.beginPath();
    ctx.arc(m.target.x * sx, m.target.y * sy, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Cars (white dots), police (blue/red dots).
  for (const car of S.cars) {
    if (car.dead) continue;
    ctx.fillStyle = car.driver === 'police' ? '#ff4444' : '#ffffff';
    ctx.fillRect(car.x * sx - 1.5, car.y * sy - 1.5, 3, 3);
  }
  // Foot cops.
  ctx.fillStyle = '#4488ff';
  for (const cop of S.cops) ctx.fillRect(cop.x * sx - 1.5, cop.y * sy - 1.5, 3, 3);
  // Player arrow.
  const p = S.player;
  if (p) {
    ctx.save();
    ctx.translate(p.x * sx, p.y * sy);
    ctx.rotate(p.angle);
    ctx.fillStyle = '#2ecc71';
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  // Border.
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
}

export function showScreen(mode) {
  const screens = ['screen-title', 'screen-pause', 'screen-wasted', 'screen-busted', 'screen-victory'];
  for (const id of screens) $(id).classList.add('hidden');
  $('hud').classList.toggle('hidden', mode === 'title' || mode === 'victory');
  if (mode === 'title') {
    $('screen-title').classList.remove('hidden');
    $('btn-continue').classList.toggle('hidden', !hasSave());
  } else if (mode === 'paused') {
    $('screen-pause').classList.remove('hidden');
  } else if (mode === 'wasted') {
    $('screen-wasted').classList.remove('hidden');
  } else if (mode === 'busted') {
    $('screen-busted').classList.remove('hidden');
  } else if (mode === 'victory') {
    $('screen-victory').classList.remove('hidden');
    $('victory-stats').textContent =
      'Missions 6/6  •  Cash ' + fmtCash(S.cash) +
      '  •  Cars stolen ' + S.stats.stolen +
      '  •  Cash packages ' + S.stats.packages + '/10';
  }
}
