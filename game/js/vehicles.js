// Cars: the five types, driving physics, traffic AI, stealing, parking,
// and every car-to-car / car-to-building collision.
import { S, clamp, dist, rand, randInt, pick, angleDiff, WORLD_W, WORLD_H } from './util.js';
import { V_ROADS, H_ROADS, ROAD_W, buildingHit, onRoad, nearestRoadPoint, BEACH_X, SEA_X } from './city.js';
import { keyDown, keyPressed, mouse } from './input.js';
import { addSkid, addShake, spawnSparks, spawnSmoke, addFloatText } from './fx.js';
import { playCrash, playChime, playError } from './audio.js';
import { commitCrime } from './police.js';

export const CAR_TYPES = {
  sedan: { name: 'Sedan', top: 270, accel: 190, turn: 2.7, hp: 100, colors: ['#c0392b', '#2c3e50', '#7f8c8d'] },
  taxi: { name: 'Taxi', top: 260, accel: 185, turn: 2.7, hp: 100, colors: ['#f1c40f'] },
  sports: { name: 'Sports', top: 350, accel: 270, turn: 3.1, hp: 80, colors: ['#e74c3c', '#8e44ad', '#16a085'] },
  truck: { name: 'Truck', top: 200, accel: 120, turn: 1.9, hp: 160, colors: ['#5d6d7e', '#935116'] },
  police: { name: 'Cruiser', top: 230, accel: 230, turn: 2.9, hp: 120, colors: ['#1a1a2e'] },
};

export function makeCar(type, x, y, angle, driver) {
  const t = CAR_TYPES[type];
  return {
    type, x, y, angle, speed: 0,
    top: t.top, accel: t.accel, turn: t.turn,
    hp: t.hp, maxHp: t.hp,
    color: pick(t.colors),
    driver: driver || 'none', // player | npc | police | parked | none
    w: type === 'truck' ? 52 : 42,
    h: type === 'truck' ? 24 : 20,
    hitCd: 0, // per-car collision cooldown
    aiDir: 0, // traffic: current road heading
    aiTarget: null, // traffic: next intersection
    aiWait: 0,
    passT: 0, // traffic: seconds left passing a stopped car in the other lane
    shoved: 0,
    dead: false,
  };
}

export function spawnTraffic(count) {
  const types = ['sedan', 'taxi', 'sedan', 'sports', 'truck', 'taxi'];
  for (let i = 0; i < count; i++) {
    const vertical = Math.random() < 0.5;
    let x, y, angle;
    if (vertical) {
      x = pick(V_ROADS) + (Math.random() < 0.5 ? -28 : 28);
      y = rand(80, WORLD_H - 80);
      angle = Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      x = rand(80, WORLD_W - 80);
      y = pick(H_ROADS) + (Math.random() < 0.5 ? -28 : 28);
      angle = Math.random() < 0.5 ? 0 : Math.PI;
    }
    const car = makeCar(pick(types), x, y, angle, 'npc');
    car.speed = rand(90, 150);
    car.aiDir = angle;
    S.cars.push(car);
  }
  // Parked cars along the roads.
  for (let i = 0; i < 8; i++) {
    const vertical = Math.random() < 0.5;
    let x, y, angle;
    if (vertical) {
      x = pick(V_ROADS) + (Math.random() < 0.5 ? -52 : 52);
      y = rand(200, WORLD_H - 200);
      angle = Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      x = rand(200, WORLD_W - 200);
      y = pick(H_ROADS) + (Math.random() < 0.5 ? -52 : 52);
      angle = Math.random() < 0.5 ? 0 : Math.PI;
    }
    const car = makeCar(pick(['sedan', 'taxi', 'sports']), x, y, angle, 'parked');
    S.cars.push(car);
  }
}

export function nearestCar(x, y, maxD) {
  let best = null;
  let bestD = maxD;
  for (const c of S.cars) {
    if (c.dead || c.driver === 'police') continue;
    const d = dist(x, y, c.x, c.y);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

export function enterCar(car) {
  const p = S.player;
  p.onFoot = false;
  p.car = car;
  car.driver = 'player';
  // Block the exit key for a moment: the same edge-triggered E press that
  // entered the car would otherwise exit it again in the same frame.
  p.carCd = 0.4;
  playChime();
}

export function stealCar(car) {
  const p = S.player;
  // Pull the driver out onto the sidewalk.
  const ped = {
    x: car.x + rand(-30, 30), y: car.y + rand(-30, 30),
    angle: rand(0, Math.PI * 2), speed: 0, fleeT: 2.5, color: '#9b59b6',
    targetX: car.x, targetY: car.y, waitT: 0, stolen: true,
  };
  S.peds.push(ped);
  enterCar(car);
  S.stats.stolen++;
  // 1.5 stars, not 1.0: heat decays continuously, so exactly 1.0 slips
  // below a full star within ~0.2s and no cop ever answers the theft.
  commitCrime(1.5, car.x, car.y);
  addFloatText(car.x, car.y - 30, 'Car stolen! +1 star', '#ff6b6b');
}

export function exitCar() {
  const p = S.player;
  const car = p.car;
  if (!car) return;
  p.onFoot = true;
  p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
  p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
  p.angle = car.angle;
  car.driver = 'none';
  car.speed = 0;
  p.car = null;
}

export function damageCar(car, amount) {
  if (!car || car.dead) return;
  car.hp -= amount;
  spawnSparks(car.x, car.y);
  if (car.hp <= 0) {
    car.hp = 0;
    car.dead = true;
    car.speed = 0;
    spawnSmoke(car.x, car.y);
    if (car.driver === 'player') {
      const p = S.player;
      p.onFoot = true;
      p.car = null;
      p.x = car.x + 34;
      p.y = car.y + 34;
      addFloatText(car.x, car.y - 30, 'Car destroyed!', '#ff6b6b');
    }
    car.driver = 'none';
  }
}

// --- traffic AI: follow the road grid, turn at intersections -------------
function updateTrafficCar(car, dt) {
  if (car.aiWait > 0) {
    car.aiWait -= dt;
    car.speed = Math.max(0, car.speed - 200 * dt);
    return;
  }
  // U-turn at the edge of the road network instead of grinding against
  // the sea / world edge forever: a car that drives past the last
  // intersection east reaches the beach and never comes back.
  const EAST = 0, WEST = Math.PI, SOUTH = Math.PI / 2, NORTH = -Math.PI / 2;
  if (car.aiDir === EAST && car.x > SEA_X - 160) car.aiDir = WEST;
  else if (car.aiDir === WEST && car.x < 140) car.aiDir = EAST;
  else if (car.aiDir === SOUTH && car.y > WORLD_H - 140) car.aiDir = NORTH;
  else if (car.aiDir === NORTH && car.y < 140) car.aiDir = SOUTH;
  // Find the nearest intersection ahead; turn there sometimes.
  const aheadX = car.x + Math.cos(car.aiDir) * 60;
  const aheadY = car.y + Math.sin(car.aiDir) * 60;
  const onV = V_ROADS.some((vx) => Math.abs(aheadX - vx) < 26);
  const onH = H_ROADS.some((hy) => Math.abs(aheadY - hy) < 26);
  if (onV && onH) {
    if (Math.random() < 0.45) {
      // Turn onto the crossing road.
      const vertical = Math.abs(Math.cos(car.aiDir)) > 0.5;
      car.aiDir = vertical
        ? (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2)
        : (Math.random() < 0.5 ? 0 : Math.PI);
    }
  }
  // Steer toward the lane centre of the current road — or the opposite
  // side of it while passing a stopped car.
  const vertical = Math.abs(Math.cos(car.aiDir)) > 0.5;
  const passing = (car.passT || 0) > 0;
  const laneFlip = passing ? -1 : 1;
  if (vertical) {
    const roadX = V_ROADS.reduce((a, b) => (Math.abs(b - car.x) < Math.abs(a - car.x) ? b : a));
    const lane = roadX + (Math.sin(car.aiDir) > 0 ? 28 : -28) * laneFlip;
    car.x += clamp(lane - car.x, -60 * dt, 60 * dt);
  } else {
    const roadY = H_ROADS.reduce((a, b) => (Math.abs(b - car.y) < Math.abs(a - car.y) ? b : a));
    const lane = roadY + (Math.cos(car.aiDir) > 0 ? 28 : -28) * laneFlip;
    car.y += clamp(lane - car.y, -60 * dt, 60 * dt);
  }
  // Slow for the car ahead — unless that car is stopped (parked or
  // jammed): waiting behind a stopped car forever gridlocks whole roads,
  // and a head-on standoff between two cars never resolves. Pass it in
  // the opposite lane for 2.5s instead.
  let slow = false;
  let stoppedAhead = null;
  for (const other of S.cars) {
    if (other === car || other.dead) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const ahead = dx * Math.cos(car.aiDir) + dy * Math.sin(car.aiDir);
    const side = Math.abs(-dx * Math.sin(car.aiDir) + dy * Math.cos(car.aiDir));
    if (ahead > 0 && ahead < 70 && side < 26) {
      slow = true;
      if (Math.abs(other.speed || 0) < 10) stoppedAhead = other;
      break;
    }
  }
  if (stoppedAhead && (car.passT || 0) <= 0) car.passT = 2.5;
  if ((car.passT || 0) > 0) {
    car.passT -= dt;
    slow = false; // keep rolling while passing the stopped car
  }
  const target = slow ? 0 : 130;
  car.speed += clamp(target - car.speed, -260 * dt, 120 * dt);
  car.angle = car.aiDir;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  car.x = clamp(car.x, 60, WORLD_W - 60);
  car.y = clamp(car.y, 60, WORLD_H - 60);
}

// --- player driving -------------------------------------------------------
function updatePlayerCar(car, dt) {
  const p = S.player;
  p.carCd = Math.max(0, (p.carCd || 0) - dt);
  let throttle = 0;
  if (keyDown('w') || keyDown('arrowup')) throttle = 1;
  if (keyDown('s') || keyDown('arrowdown')) throttle = -0.7;
  let steer = 0;
  if (keyDown('a') || keyDown('arrowleft')) steer = -1;
  if (keyDown('d') || keyDown('arrowright')) steer = 1;
  // Autopilot (only for staged ?shot=play / ?shot=chase screenshots).
  if (S.autopilot && S.mission && S.mission.target) {
    const t = S.mission.target;
    const want = Math.atan2(t.y - car.y, t.x - car.x);
    const diff = angleDiff(car.angle, want);
    steer = clamp(diff * 2, -1, 1);
    throttle = Math.abs(diff) > 1.4 ? -0.4 : 1;
  }
  const reversing = car.speed < -5;
  const dir = reversing ? -1 : 1;
  car.angle += steer * car.turn * dt * clamp(Math.abs(car.speed) / 60, 0, 1) * dir;
  car.speed += throttle * car.accel * dt;
  car.speed -= car.speed * 0.55 * dt; // drag
  car.speed = clamp(car.speed, -car.top * 0.45, car.top);
  if (Math.abs(car.speed) < 4 && throttle === 0) car.speed = 0;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
  // Skid marks on hard turns at speed.
  if (Math.abs(steer) > 0.7 && Math.abs(car.speed) > 170) {
    addSkid(car.x - Math.cos(car.angle) * 16, car.y - Math.sin(car.angle) * 16, car.angle);
  }
  if (keyPressed('e') && p.carCd <= 0) exitCar();
  // Shooting from the car window is not allowed; punch is not either.
  if (car.speed > 200 && Math.random() < dt * 2) spawnSmoke(car.x, car.y);
}

// --- collisions ------------------------------------------------------------
const pairCooldowns = new Map();
function pairKey(a, b) {
  return a < b ? a + ':' + b : b + ':' + a;
}

function collideCars(dt) {
  const cars = S.cars;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      if (a.dead || b.dead) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const minD = 40;
      if (d >= minD || d === 0) continue;
      const key = pairKey(i, j);
      const cd = pairCooldowns.get(key) || 0;
      const now = S.timeMin; // cooldowns tracked in seconds via performance clock
      if (cd > performance.now()) continue;
      pairCooldowns.set(key, performance.now() + 500); // 0.5s per-pair cooldown
      // Separate and cut both speeds; a collision must slow BOTH cars.
      const push = (minD - d) / 2;
      const nx = dx / d;
      const ny = dy / d;
      a.x -= nx * push; a.y -= ny * push;
      b.x += nx * push; b.y += ny * push;
      const aSpeed = a.speed;
      const bSpeed = b.speed;
      // A cruiser ramming the player must not pin the player's car: two
      // cruisers alternating rams cut the player's speed to 45% every
      // ~0.25s, so the car can never accelerate away and the foot cops
      // arrest the driver — an unwinnable getaway, not a hard one. The
      // cruiser bounces off with the full cut; the player keeps most of
      // their momentum but still takes collision + ram damage, so the
      // cruisers stay a real threat to the car's HP.
      const playerHit = (a.driver === 'player' && b.driver === 'police')
        || (b.driver === 'player' && a.driver === 'police');
      if (playerHit) {
        if (a.driver === 'player') { a.speed *= 0.85; b.speed *= 0.45; }
        else { b.speed *= 0.85; a.speed *= 0.45; }
      } else {
        a.speed *= 0.45;
        b.speed *= 0.45;
      }
      // Parked cars get shoved and slide instead of grinding the player.
      if (a.driver === 'parked') { a.x += nx * 14; a.y += ny * 14; a.shoved = 0.4; }
      if (b.driver === 'parked') { b.x -= nx * 14; b.y -= ny * 14; b.shoved = 0.4; }
      if (Math.abs(aSpeed) > 60 || Math.abs(bSpeed) > 60) {
        spawnSparks((a.x + b.x) / 2, (a.y + b.y) / 2);
        playCrash();
        if (a.driver === 'player' || b.driver === 'player') addShake(5);
        // Collision damage to the player is 2 (was 4): at 4, a getaway
        // car took ~1.6 hp/s from cruiser rams during U-turns and died
        // (~80hp) before heat could decay from 3.5 to 0.2.
        if (a.driver === 'player') damageCar(a, 2);
        if (b.driver === 'player') damageCar(b, 2);
      }
    }
  }
  // Prune stale cooldown entries.
  if (pairCooldowns.size > 400) {
    const now = performance.now();
    for (const [k, v] of pairCooldowns) if (v < now) pairCooldowns.delete(k);
  }
}

function collideBuildings(dt) {
  for (const car of S.cars) {
    if (car.dead) continue;
    const b = buildingHit(car.x, car.y, 22);
    if (b) {
      car.hitCd -= dt;
      if (car.hitCd <= 0) {
        car.hitCd = 0.5; // cooldown-gated so contact does not grind
        car.speed *= 0.35;
        if (Math.abs(car.speed) > 40 || car.driver === 'player') {
          spawnSparks(car.x, car.y);
          playCrash();
          if (car.driver === 'player') { damageCar(car, 3); addShake(4); }
        }
      }
      // Push out along the smallest penetration axis.
      const left = car.x - b.x;
      const right = b.x + b.w - car.x;
      const top = car.y - b.y;
      const bottom = b.y + b.h - car.y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) car.x = b.x - 22;
      else if (m === right) car.x = b.x + b.w + 22;
      else if (m === top) car.y = b.y - 22;
      else car.y = b.y + b.h + 22;
    } else {
      car.hitCd = Math.max(0, car.hitCd - dt);
    }
    if (car.x > SEA_X - 24) { car.x = SEA_X - 24; car.speed *= 0.5; }
    car.x = clamp(car.x, 30, WORLD_W - 30);
    car.y = clamp(car.y, 30, WORLD_H - 30);
  }
}

export function updateVehicles(dt) {
  const p = S.player;
  for (const car of S.cars) {
    if (car.dead) continue;
    if (car.driver === 'player') updatePlayerCar(car, dt);
    else if (car.driver === 'npc') updateTrafficCar(car, dt);
    else if (car.driver === 'police') { /* cruisers are driven by police.js */ }
    else if (car.driver === 'parked' && car.shoved > 0) {
      car.shoved -= dt;
      car.speed *= 0.92;
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
    }
  }
  collideCars(dt);
  collideBuildings(dt);
  // Keep traffic topped up near the player.
  const traffic = S.cars.filter((c) => c.driver === 'npc').length;
  if (traffic < 12 && Math.random() < dt * 0.5) {
    const vertical = Math.random() < 0.5;
    let x, y, angle;
    if (vertical) {
      x = pick(V_ROADS) + (Math.random() < 0.5 ? -28 : 28);
      y = clamp(p.y + (Math.random() < 0.5 ? -600 : 600), 80, WORLD_H - 80);
      angle = Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      x = clamp(p.x + (Math.random() < 0.5 ? -600 : 600), 80, WORLD_W - 80);
      y = pick(H_ROADS) + (Math.random() < 0.5 ? -28 : 28);
      angle = Math.random() < 0.5 ? 0 : Math.PI;
    }
    const car = makeCar(pick(['sedan', 'taxi', 'sports', 'truck']), x, y, angle, 'npc');
    car.speed = rand(90, 150);
    car.aiDir = angle;
    S.cars.push(car);
  }
}

export function drawCars(ctx) {
  for (const car of S.cars) {
    if (car.dead && car.driver !== 'player') {
      // Wreck: dark shell, still visible.
      ctx.save();
      ctx.translate(car.x, car.y);
      ctx.rotate(car.angle);
      ctx.fillStyle = '#222222';
      ctx.fillRect(-car.w / 2, -car.h / 2, car.w, car.h);
      ctx.restore();
      continue;
    }
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(2, 4, car.w / 2, car.h / 2 + 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = car.color;
    ctx.beginPath();
    ctx.roundRect(-car.w / 2, -car.h / 2, car.w, car.h, 6);
    ctx.fill();
    // Cabin + windshield.
    ctx.fillStyle = 'rgba(180,220,240,0.85)';
    ctx.beginPath();
    ctx.roundRect(-car.w / 6, -car.h / 2 + 3, car.w / 3, car.h - 6, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(car.w / 2 - 6, -car.h / 2 + 2, 3, 4);
    ctx.fillRect(car.w / 2 - 6, car.h / 2 - 6, 3, 4);
    // Headlights.
    ctx.fillStyle = '#fff8c8';
    ctx.fillRect(car.w / 2 - 2, -car.h / 2 + 3, 3, 5);
    ctx.fillRect(car.w / 2 - 2, car.h / 2 - 8, 3, 5);
    if (car.type === 'police') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-car.w / 2 + 4, -car.h / 2 + 3, 12, car.h - 6);
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(-car.w / 2 + 2, -car.h / 2 - 3, 8, 5);
      ctx.fillStyle = '#3498db';
      ctx.fillRect(-car.w / 2 + 2, car.h / 2 - 2, 8, 5);
    }
    if (car.type === 'taxi') {
      ctx.fillStyle = '#111111';
      ctx.font = 'bold 8px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('TAXI', 0, 3);
    }
    // Damage smoke.
    if (car.hp < car.maxHp * 0.4 && Math.random() < 0.3) spawnSmoke(car.x, car.y);
    ctx.restore();
    // HP bar over the player's car when damaged.
    if (car.driver === 'player' && car.hp < car.maxHp) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(car.x - 24, car.y - 32, 48, 6);
      ctx.fillStyle = car.hp > 40 ? '#2ecc71' : '#e74c3c';
      ctx.fillRect(car.x - 24, car.y - 32, 48 * (car.hp / car.maxHp), 6);
    }
  }
}
