// The story: six sequential missions for Rex Dalton, each with a briefing,
// an objective marker, and a cash reward. Free roam between missions.
import { S, clamp, dist, fmtCash } from './util.js';
import { addFloatText, spawnParticles } from './fx.js';
import { playJingle, playPickup } from './audio.js';
import { makeCar } from './vehicles.js';
import { spawnViper } from './combat.js';
import { commitCrime } from './police.js';
import { saveGame } from './save.js';

export const MISSIONS = [
  {
    id: 1, name: 'First Wheels', reward: 250,
    brief: 'Rex is back in Solmar City with fifty bucks and no ride. "Borrow" any car and bring it to the marker.',
    objective: 'Steal any car and drive to the marker',
  },
  {
    id: 2, name: 'Delivery Run', reward: 600,
    brief: 'Mara at the marina needs a package across town, fast. One hundred seconds on the clock. No excuses.',
    objective: 'Deliver the package in 100 seconds',
  },
  {
    id: 3, name: 'Shakedown', reward: 1000,
    brief: 'Finn owes the crew a grand and thinks running helps. Chase him down and remind him — with your fists.',
    objective: 'Catch Finn and beat him up (about 4 punches)',
  },
  {
    id: 4, name: 'Getaway', reward: 800,
    brief: 'Three stars and every cruiser in Solmar on your tail. Lose them. Stay unseen until the heat dies down.',
    objective: 'Lose the cops: get heat below 0.2',
  },
  {
    id: 5, name: 'Dockside Deal', reward: 1000,
    brief: 'The Vipers are moving product at the docks tonight. Crash the deal. Five of them, one of you. Careful now.',
    objective: 'Defeat all 5 Vipers at the docks',
  },
  {
    id: 6, name: 'The Big Score', reward: 1500,
    brief: 'The Solmar Reserve vault. Hold the channel for five seconds, crack it, then run — the whole city will be looking.',
    objective: 'Crack the vault (5s channel), then escape',
  },
];

export function missionDef(index) {
  return MISSIONS[index] || null;
}

export function startMission(index) {
  const def = MISSIONS[index];
  if (!def) return;
  const p = S.player;
  const m = { kind: '', def, target: null, timer: 0, stage: 'go', debtor: null, vipersLeft: 0 };
  if (index === 0) {
    m.kind = 'steal';
    m.target = { x: 2200, y: 900 };
  } else if (index === 1) {
    m.kind = 'delivery';
    m.timer = 100;
    m.pickup = { x: 2400, y: 400 };
    m.stage = 'pickup';
    m.target = m.pickup;
  } else if (index === 2) {
    m.kind = 'shakedown';
    m.debtor = {
      x: clamp(p.x + 260, 100, 3100), y: clamp(p.y + 120, 100, 2300),
      angle: 0, hp: 100, down: false, speed: 205,
    };
    m.target = { x: m.debtor.x, y: m.debtor.y };
  } else if (index === 3) {
    m.kind = 'getaway';
    S.wantedHeat = 3.5; // 3 stars (a little over 3 so decay does not drop a star instantly)
    commitCrime(0, p.x, p.y);
    m.target = { x: p.x, y: p.y };
  } else if (index === 4) {
    m.kind = 'shootout';
    m.target = { x: S.docks.x, y: S.docks.y };
    m.stage = 'travel';
    S.vipers = [];
    const spots = [
      [S.docks.x - 90, S.docks.y - 60], [S.docks.x + 80, S.docks.y - 80],
      [S.docks.x - 60, S.docks.y + 80], [S.docks.x + 100, S.docks.y + 60],
      [S.docks.x, S.docks.y - 120],
    ];
    for (const [x, y] of spots) S.vipers.push(spawnViper(x, y));
    m.vipersLeft = 5;
    // A health pickup at the docks so a careful player can win with low HP.
    S.healthPickups.push({ x: S.docks.x + 170, y: S.docks.y + 140 });
  } else if (index === 5) {
    m.kind = 'vault';
    m.target = { x: S.vault.x, y: S.vault.y };
    m.stage = 'travel';
    S.vaultChannel = 0;
  }
  S.mission = m;
  S.missionIndex = index;
  showBriefing(def);
}

export function showBriefing(def) {
  S.briefing = { title: 'Mission ' + def.id + ': ' + def.name, text: def.brief, t: 7 };
}

export function completeMission() {
  const def = S.mission.def;
  S.cash += def.reward;
  S.missionsDone++;
  S.missionIndex++;
  addFloatText(S.player.x, S.player.y - 40, 'Mission complete! +' + fmtCash(def.reward), '#2ecc71');
  spawnParticles(S.player.x, S.player.y, 30, '#f5c542', 240);
  playJingle();
  S.mission = null;
  S.vipers = [];
  if (S.missionsDone >= 6) {
    S.mode = 'victory';
    return;
  }
  S.missionMsg = 'Mission ' + def.id + ' complete! +' + fmtCash(def.reward) + ' — next mission ready. Press Enter to start it.';
  S.missionMsgT = 8;
  saveGame();
}

export function failMission(reason) {
  S.missionMsg = reason + ' — mission failed. Press Enter to retry.';
  S.missionMsgT = 8;
  S.mission = null;
  S.vipers = [];
}

export function updateMissions(dt) {
  // Skip the whole update unless play is actually in progress: the
  // busted/wasted transition can happen mid-frame (a cop touch or a
  // fatal hit), and a bust zeroes heat — letting the update run in that
  // same frame would complete a getaway at the exact moment of capture.
  if (S.mode !== 'playing') return;
  const m = S.mission;
  const p = S.player;
  if (!m || !p) return;
  if (m.kind === 'steal') {
    if (!p.onFoot && p.car) {
      if (dist(p.x, p.y, m.target.x, m.target.y) < 90) completeMission();
    }
  } else if (m.kind === 'delivery') {
    m.timer -= dt;
    if (m.timer <= 0) { failMission('Delivery too slow'); return; }
    if (m.stage === 'pickup') {
      if (dist(p.x, p.y, m.target.x, m.target.y) < 70) {
        m.stage = 'deliver';
        m.target = { x: 400, y: 1900 };
        S.missionMsg = 'Package collected! Deliver it to the south-west marker.';
        S.missionMsgT = 4;
        playPickup();
      }
    } else if (dist(p.x, p.y, m.target.x, m.target.y) < 90) {
      completeMission();
    }
  } else if (m.kind === 'shakedown') {
    const d = m.debtor;
    if (d && !d.down) {
      // Finn flees from the player, staying inside the world.
      const dp = dist(d.x, d.y, p.x, p.y);
      if (dp < 320) {
        const a = Math.atan2(d.y - p.y, d.x - p.x);
        d.x = clamp(d.x + Math.cos(a) * d.speed * dt, 60, 3140);
        d.y = clamp(d.y + Math.sin(a) * d.speed * dt, 60, 2340);
        d.angle = a;
      }
      m.target = { x: d.x, y: d.y };
      if (dp < 60 && p.onFoot) {
        S.missionMsg = 'He is right there — punch him! (Left click)';
        S.missionMsgT = 2;
      }
    } else if (d && d.down) {
      completeMission();
    }
  } else if (m.kind === 'getaway') {
    if (S.wantedHeat < 0.2) completeMission();
  } else if (m.kind === 'shootout') {
    if (m.stage === 'travel') {
      if (dist(p.x, p.y, m.target.x, m.target.y) < 260) m.stage = 'fight';
    }
    m.vipersLeft = S.vipers.filter((v) => !v.down).length;
    if (m.stage === 'fight' && m.vipersLeft === 0) completeMission();
  } else if (m.kind === 'vault') {
    if (m.stage === 'travel') {
      if (dist(p.x, p.y, m.target.x, m.target.y) < 110) m.stage = 'channel';
    } else if (m.stage === 'channel') {
      if (dist(p.x, p.y, m.target.x, m.target.y) > 130) {
        m.stage = 'travel';
        S.vaultChannel = 0;
      } else {
        S.vaultChannel += dt;
        if (S.vaultChannel >= 5) {
          m.stage = 'escape';
          S.wantedHeat = 3.5;
          S.missionMsg = 'Vault cracked! Now escape the heat!';
          S.missionMsgT = 5;
          playJingle();
        }
      }
    } else if (m.stage === 'escape') {
      if (S.wantedHeat < 0.2) completeMission();
    }
  }
  if (S.missionMsgT > 0) S.missionMsgT -= dt;
  if (S.briefing) {
    S.briefing.t -= dt;
    if (S.briefing.t <= 0) S.briefing = null;
  }
}

export function drawMissionMarker(ctx) {
  const m = S.mission;
  if (!m || !m.target) return;
  const t = m.target;
  // Pulsing world marker + a beam so it reads from far away.
  const pulse = 1 + Math.sin(performance.now() / 300) * 0.15;
  ctx.fillStyle = 'rgba(255,214,64,0.18)';
  ctx.beginPath();
  ctx.arc(t.x, t.y, 60 * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffd640';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(t.x, t.y, 26 * pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#ffd640';
  ctx.beginPath();
  ctx.moveTo(t.x, t.y - 34);
  ctx.lineTo(t.x + 10, t.y - 12);
  ctx.lineTo(t.x - 10, t.y - 12);
  ctx.closePath();
  ctx.fill();
  // Debtor marker.
  if (m.kind === 'shakedown' && m.debtor && !m.debtor.down) {
    const d = m.debtor;
    ctx.fillStyle = '#e74c3c';
    ctx.beginPath();
    ctx.arc(d.x, d.y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('FINN', d.x, d.y - 20);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(d.x - 18, d.y + 16, 36, 5);
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(d.x - 18, d.y + 16, 36 * (d.hp / 100), 5);
  }
  // Vault channel progress ring.
  if (m.kind === 'vault' && m.stage === 'channel') {
    ctx.strokeStyle = '#2ecc71';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(S.vault.x, S.vault.y, 44, -Math.PI / 2, -Math.PI / 2 + (S.vaultChannel / 5) * Math.PI * 2);
    ctx.stroke();
  }
}

// Arrow at the screen edge pointing at the objective.
export function drawObjectiveArrow(ctx, vw, vh) {
  const m = S.mission;
  if (!m || !m.target) return;
  const p = S.player;
  const tx = m.target.x - S.camX;
  const ty = m.target.y - S.camY;
  if (tx > 40 && tx < vw - 40 && ty > 40 && ty < vh - 40) return; // on screen already
  const cx = vw / 2;
  const cy = vh / 2;
  const ang = Math.atan2(ty - cy, tx - cx);
  const ex = cx + Math.cos(ang) * (Math.min(vw, vh) / 2 - 60);
  const ey = cy + Math.sin(ang) * (Math.min(vw, vh) / 2 - 60);
  ctx.save();
  ctx.translate(ex, ey);
  ctx.rotate(ang);
  ctx.fillStyle = '#ffd640';
  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.lineTo(-10, -12);
  ctx.lineTo(-10, 12);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  const d = Math.round(dist(p.x, p.y, m.target.x, m.target.y));
  ctx.fillStyle = '#ffd640';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(d + 'm', ex, ey + 30);
}
