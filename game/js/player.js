// Rex Dalton on foot: movement, sprint, entering / stealing cars, and
// interacting with shops, packages and mission spots.
import { S, clamp, dist, WORLD_W, WORLD_H, angleDiff } from './util.js';
import { resolveBuildingCollision, buildingHit } from './city.js';
import { keyDown, keyPressed, mouse } from './input.js';
import { addShake, spawnBlood, addFloatText } from './fx.js';
import { playPunch, playPickup, playChime, playError } from './audio.js';
import { nearestCar, enterCar, stealCar } from './vehicles.js';
import { punchAt, shootAt } from './combat.js';

export function createPlayer(x, y) {
  return {
    x, y, angle: -Math.PI / 2, speed: 0,
    hp: 100, maxHp: 100,
    onFoot: true, car: null,
    hasPistol: false, ammo: 0,
    punchCd: 0, shootCd: 0, hurtT: 0,
    sprinting: false, carCd: 0, // cooldown after entering a car (see vehicles.js)
  };
}

export function damagePlayer(amount, source) {
  const p = S.player;
  if (!p || p.hp <= 0) return;
  p.hp -= amount;
  p.hurtT = 0.5;
  spawnBlood(p.x, p.y);
  addShake(4);
  if (p.hp <= 0) {
    p.hp = 0;
    if (S.mode === 'playing') {
      S.mode = 'wasted';
      S.cash = Math.max(0, S.cash - 50);
      addFloatText(p.x, p.y - 30, '-$50 hospital fee', '#ff6b6b');
    }
  }
}

export function healPlayer(amount) {
  const p = S.player;
  if (!p) return;
  // Health regen applies ONLY while alive: a dead player must not regen back.
  if (p.hp > 0) p.hp = Math.min(p.maxHp, p.hp + amount);
}

export function updatePlayer(dt) {
  const p = S.player;
  if (!p || p.hp <= 0) return;
  p.punchCd = Math.max(0, p.punchCd - dt);
  p.shootCd = Math.max(0, p.shootCd - dt);
  p.hurtT = Math.max(0, p.hurtT - dt);

  if (!p.onFoot) return; // driving is handled by vehicles.js

  // Aim at the mouse (world position).
  const wx = S.camX + mouse.x;
  const wy = S.camY + mouse.y;
  p.angle = Math.atan2(wy - p.y, wx - p.x);

  let mx = 0;
  let my = 0;
  if (keyDown('w') || keyDown('arrowup')) my -= 1;
  if (keyDown('s') || keyDown('arrowdown')) my += 1;
  if (keyDown('a') || keyDown('arrowleft')) mx -= 1;
  if (keyDown('d') || keyDown('arrowright')) mx += 1;
  p.sprinting = keyDown('shift');
  const speed = p.sprinting ? 250 : 150;
  if (mx !== 0 || my !== 0) {
    const len = Math.hypot(mx, my);
    p.x += (mx / len) * speed * dt;
    p.y += (my / len) * speed * dt;
    p.speed = speed;
  } else {
    p.speed = 0;
  }
  p.x = clamp(p.x, 16, WORLD_W - 16);
  p.y = clamp(p.y, 16, WORLD_H - 16);
  resolveBuildingCollision(p, 14);

  // Attack: left mouse punches, or fires the pistol when owned.
  if (mouse.down && p.punchCd <= 0) {
    if (p.hasPistol && p.ammo > 0) {
      if (p.shootCd <= 0) { shootAt(p.x, p.y, p.angle, 'player'); p.shootCd = 0.28; }
    } else {
      punchAt(p.x, p.y, p.angle, 'player');
      p.punchCd = 0.42;
      playPunch();
    }
  }

  // Enter / steal a car.
  if (keyPressed('e')) {
    const car = nearestCar(p.x, p.y, 70);
    if (car) {
      if (car.driver === 'none' || car.driver === 'parked') {
        enterCar(car);
      } else if (car.driver === 'npc') {
        stealCar(car);
      }
    } else {
      tryInteract();
    }
  }

  // Pick up hidden cash packages.
  for (const pkg of S.packages) {
    if (!pkg.taken && dist(p.x, p.y, pkg.x, pkg.y) < 26) {
      pkg.taken = true;
      S.cash += 100;
      S.stats.packages++;
      addFloatText(pkg.x, pkg.y - 20, '+$100 cash package', '#2ecc71');
      playChime();
    }
  }
  // Health pickups.
  for (let i = S.healthPickups.length - 1; i >= 0; i--) {
    const hp = S.healthPickups[i];
    if (dist(p.x, p.y, hp.x, hp.y) < 26) {
      healPlayer(50);
      addFloatText(hp.x, hp.y - 20, '+50 HP', '#2ecc71');
      playPickup();
      S.healthPickups.splice(i, 1);
    }
  }
}

function tryInteract() {
  const p = S.player;
  for (const s of S.shops) {
    if (dist(p.x, p.y, s.doorX, s.doorY) < 90) {
      S.shopOpen = s.kind;
      return;
    }
  }
  // Ammo pickups are collected by walking over them (handled in combat.js).
}

export function drawPlayer(ctx) {
  const p = S.player;
  if (!p || p.hp <= 0) return;
  if (!p.onFoot) return; // driver is drawn with the car
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(2, 4, 14, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  // Rex: orange jacket, dark jeans.
  ctx.fillStyle = p.hurtT > 0 && Math.floor(p.hurtT * 12) % 2 === 0 ? '#ffffff' : '#e67e22';
  ctx.beginPath();
  ctx.arc(0, 0, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f2c89b';
  ctx.beginPath();
  ctx.arc(7, 0, 6, 0, Math.PI * 2);
  ctx.fill();
  // Fists / pistol in hand.
  ctx.fillStyle = p.hasPistol ? '#333333' : '#f2c89b';
  ctx.fillRect(10, -8, 10, 5);
  ctx.fillRect(10, 3, 10, 5);
  ctx.restore();
}
