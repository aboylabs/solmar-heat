// Combat: fists, the pistol, bullets, ammo pickups, and the Viper gang.
// A punch beats the mission-3 debtor in about 4 hits: punch damage 26,
// debtor HP 100.
import { S, clamp, dist, rand } from './util.js';
import { spawnBlood, spawnSparks, addFloatText, addShake, spawnParticles } from './fx.js';
import { playGunshot, playPunch } from './audio.js';
import { scarePeds } from './pedestrians.js';
import { damagePlayer } from './player.js';
import { commitCrime } from './police.js';
import { damageCar } from './vehicles.js';
import { buildingHit } from './city.js';

export const PUNCH_DAMAGE = 26;
export const PUNCH_RANGE = 46;
export const BULLET_SPEED = 720;
export const VIPER_DAMAGE = 8;

export function punchAt(x, y, angle, who) {
  const range = PUNCH_RANGE;
  const hx = x + Math.cos(angle) * 30;
  const hy = y + Math.sin(angle) * 30;
  spawnParticlesSmall(hx, hy);
  // Hit pedestrians (counts as assault).
  for (const ped of S.peds) {
    if (dist(hx, hy, ped.x, ped.y) < 26) {
      ped.fleeT = 3;
      ped.targetX = ped.x + (ped.x - x) * 3;
      ped.targetY = ped.y + (ped.y - y) * 3;
      spawnBlood(ped.x, ped.y);
      addFloatText(ped.x, ped.y - 20, 'Assault!', '#ff6b6b');
      if (who === 'player') commitCrime(0.6, x, y);
      return true;
    }
  }
  // Hit the mission-3 debtor.
  const m = S.mission;
  if (who === 'player' && m && m.kind === 'shakedown' && m.debtor && !m.debtor.down) {
    if (dist(hx, hy, m.debtor.x, m.debtor.y) < 30) {
      hurtDebtor(PUNCH_DAMAGE);
      return true;
    }
  }
  // Hit a Viper.
  for (const v of S.vipers) {
    if (!v.down && dist(hx, hy, v.x, v.y) < 30) {
      v.hp -= PUNCH_DAMAGE;
      spawnBlood(v.x, v.y);
      if (v.hp <= 0) { v.down = true; S.stats.kos++; }
      return true;
    }
  }
  // Hit a foot cop (a very bad idea).
  for (const cop of S.cops) {
    if (dist(hx, hy, cop.x, cop.y) < 28) {
      spawnBlood(cop.x, cop.y);
      if (who === 'player') commitCrime(1.0, x, y);
      return true;
    }
  }
  return false;
}

function spawnParticlesSmall(x, y) {
  spawnParticles(x, y, 4, '#ffffff', 90);
}

export function hurtDebtor(amount) {
  const m = S.mission;
  if (!m || !m.debtor) return;
  m.debtor.hp -= amount;
  spawnBlood(m.debtor.x, m.debtor.y);
  playPunch();
  if (m.debtor.hp <= 0) {
    m.debtor.down = true;
    S.stats.kos++;
  }
}

export function shootAt(x, y, angle, who) {
  const p = S.player;
  if (who === 'player') {
    if (!p.hasPistol || p.ammo <= 0) return;
    p.ammo--;
  }
  S.bullets.push({
    x: x + Math.cos(angle) * 24, y: y + Math.sin(angle) * 24,
    vx: Math.cos(angle) * BULLET_SPEED, vy: Math.sin(angle) * BULLET_SPEED,
    life: 1.1, who,
  });
  playGunshot();
  addShake(2);
  scarePeds(x, y, 320);
  if (who === 'player') {
    // Firing near police raises heat.
    for (const cop of S.cops) {
      if (dist(x, y, cop.x, cop.y) < 420) { commitCrime(0.5, x, y); break; }
    }
    for (const car of S.cars) {
      if (car.driver === 'police' && dist(x, y, car.x, car.y) < 520) { commitCrime(0.5, x, y); break; }
    }
  }
}

export function spawnViper(x, y) {
  return {
    x, y, angle: 0, hp: 50, down: false,
    shootCd: rand(0.5, 1.5), speed: 120,
    homeX: x, homeY: y,
  };
}

export function updateBullets(dt) {
  for (let i = S.bullets.length - 1; i >= 0; i--) {
    const b = S.bullets[i];
    b.life -= dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    let dead = b.life <= 0;
    // Buildings stop bullets.
    if (!dead && buildingHit(b.x, b.y, 2)) {
      spawnSparks(b.x, b.y);
      dead = true;
    }
    if (!dead) {
      // Hit the player (enemy bullets only).
      const p = S.player;
      if (b.who === 'viper' && p && p.hp > 0 && p.onFoot && dist(b.x, b.y, p.x, p.y) < 14) {
        damagePlayer(VIPER_DAMAGE, 'viper');
        dead = true;
      }
      // Hit the player's car.
      if (!dead && b.who === 'viper' && p && p.car && !p.car.dead && dist(b.x, b.y, p.car.x, p.car.y) < 24) {
        damageCar(p.car, 2);
        dead = true;
      }
      // Hit a Viper (player bullets only).
      if (!dead && b.who === 'player') {
        for (const v of S.vipers) {
          if (!v.down && dist(b.x, b.y, v.x, v.y) < 16) {
            v.hp -= 34;
            spawnBlood(v.x, v.y);
            if (v.hp <= 0) { v.down = true; S.stats.kos++; addFloatText(v.x, v.y - 20, 'Viper down', '#2ecc71'); }
            dead = true;
            break;
          }
        }
      }
      // Hit the debtor with a bullet (counts, but fists are the intended tool).
      if (!dead && b.who === 'player' && S.mission && S.mission.kind === 'shakedown' && S.mission.debtor && !S.mission.debtor.down) {
        const d = S.mission.debtor;
        if (dist(b.x, b.y, d.x, d.y) < 16) {
          hurtDebtor(34);
          dead = true;
        }
      }
      // Hit a pedestrian (counts as assault).
      if (!dead && b.who === 'player') {
        for (const ped of S.peds) {
          if (dist(b.x, b.y, ped.x, ped.y) < 12) {
            ped.fleeT = 3;
            spawnBlood(ped.x, ped.y);
            commitCrime(1.0, b.x, b.y);
            dead = true;
            break;
          }
        }
      }
    }
    if (dead) S.bullets.splice(i, 1);
  }
}

export function updateVipers(dt) {
  const p = S.player;
  for (const v of S.vipers) {
    if (v.down) continue;
    const d = dist(v.x, v.y, p.x, p.y);
    // Hold near the deal spot, strafe toward the player when close.
    if (d > 320) {
      const a = Math.atan2(v.homeY - v.y, v.homeX - v.x);
      v.x += Math.cos(a) * v.speed * dt;
      v.y += Math.sin(a) * v.speed * dt;
    } else if (d > 200) {
      const a = Math.atan2(p.y - v.y, p.x - v.x);
      v.x += Math.cos(a) * v.speed * 0.7 * dt;
      v.y += Math.sin(a) * v.speed * 0.7 * dt;
    }
    v.angle = Math.atan2(p.y - v.y, p.x - v.x);
    v.shootCd -= dt;
    if (v.shootCd <= 0 && d < 460 && p.hp > 0) {
      v.shootCd = rand(1.1, 1.7);
      const spread = rand(-0.12, 0.12);
      S.bullets.push({
        x: v.x + Math.cos(v.angle) * 20, y: v.y + Math.sin(v.angle) * 20,
        vx: Math.cos(v.angle + spread) * (BULLET_SPEED * 0.8),
        vy: Math.sin(v.angle + spread) * (BULLET_SPEED * 0.8),
        life: 1.1, who: 'viper',
      });
      playGunshot();
    }
  }
}

export function drawBullets(ctx) {
  ctx.fillStyle = '#ffe14d';
  for (const b of S.bullets) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawVipers(ctx) {
  for (const v of S.vipers) {
    if (v.down) {
      ctx.save();
      ctx.translate(v.x, v.y);
      ctx.rotate(v.angle + Math.PI / 2);
      ctx.fillStyle = '#7b2d8b';
      ctx.beginPath();
      ctx.ellipse(0, 0, 12, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      continue;
    }
    ctx.save();
    ctx.translate(v.x, v.y);
    ctx.rotate(v.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 3, 11, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7b2d8b'; // Viper purple
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2c89b';
    ctx.beginPath();
    ctx.arc(5, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#222222';
    ctx.fillRect(9, -3, 12, 4); // gun
    ctx.restore();
    // HP bar.
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(v.x - 16, v.y - 24, 32, 5);
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(v.x - 16, v.y - 24, 32 * (v.hp / 50), 5);
  }
}

// Ammo pickups scattered around the city (small green boxes).
export function spawnAmmoPickups() {
  const spots = [
    [700, 700], [1300, 1300], [2500, 700], [700, 1800], [1900, 2100], [2500, 1600],
  ];
  S.ammoPickups = spots.map(([x, y]) => ({ x, y, taken: false }));
}

export function updateAmmoPickups() {
  if (!S.ammoPickups) return;
  const p = S.player;
  for (const a of S.ammoPickups) {
    if (!a.taken && dist(p.x, p.y, a.x, a.y) < 26) {
      a.taken = true;
      p.ammo += 12;
      addFloatText(a.x, a.y - 20, '+12 ammo', '#2ecc71');
    }
  }
}

export function drawAmmoPickups(ctx) {
  if (!S.ammoPickups) return;
  for (const a of S.ammoPickups) {
    if (a.taken) continue;
    ctx.fillStyle = '#27ae60';
    ctx.fillRect(a.x - 10, a.y - 7, 20, 14);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('AMMO', a.x, a.y + 3);
  }
}
