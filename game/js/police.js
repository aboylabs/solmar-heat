// Wanted level and the police response: foot cops, cruisers, ramming,
// arrest (BUSTED), and heat decay when the player lies low and unseen.
//
// THE DECAY GUARD: heat is a CONTINUOUS value (0..5) and stars are just
// floor(heat). Decay must test the continuous heat value (heat > 0), NOT
// floor(stars) > 0: testing the floored value freezes heat at ~1.0 forever
// once it drops below a full star. Do not "fix" this guard.
import { S, clamp, dist, rand, pick, WORLD_W, WORLD_H } from './util.js';
import { nearestRoadPoint, resolveBuildingCollision } from './city.js';
import { damageCar, makeCar } from './vehicles.js';
import { damagePlayer } from './player.js';
import { addFloatText, spawnSparks } from './fx.js';

export function commitCrime(amount, x, y) {
  S.wantedHeat = clamp(S.wantedHeat + amount, 0, 5);
  S.lastCrimeT = S.timeMin;
}

export function policeSeesPlayer() {
  const p = S.player;
  if (!p) return false;
  for (const cop of S.cops) if (dist(cop.x, cop.y, p.x, p.y) < 420) return true;
  for (const car of S.cars) {
    if (car.driver === 'police' && dist(car.x, car.y, p.x, p.y) < 520) return true;
  }
  return false;
}

export function updateWanted(dt) {
  const stars = Math.floor(S.wantedHeat);
  // Heat decays only when the player commits no crime and is unseen.
  // Guard on the CONTINUOUS heat value, not on floor(stars).
  // Heat fades at 0.09/s while unseen (up from 0.055): at the old rate a
  // 3.5-star escape needed ~60s fully unseen, but cruisers keep the
  // player spotted 30-60% of the time, so the car was ground to scrap
  // before the heat ever cleared. 0.09/s needs ~37s unseen — still a
  // real chase, but one a healthy car can survive.
  if (S.wantedHeat > 0 && !policeSeesPlayer()) {
    S.wantedHeat = Math.max(0, S.wantedHeat - 0.09 * dt);
  }
  // Scale the force to the stars.
  const wantCops = stars >= 1 ? Math.min(3, stars) : 0;
  const wantCruisers = stars >= 3 ? (stars >= 5 ? 3 : stars - 1) : 0;
  while (S.cops.length < wantCops) spawnCop();
  while (S.cops.length > wantCops) S.cops.pop();
  const cruisers = S.cars.filter((c) => c.driver === 'police' && !c.dead).length;
  if (cruisers < wantCruisers) spawnCruiser();
  if (cruisers > wantCruisers) {
    const extra = S.cars.find((c) => c.driver === 'police' && !c.dead);
    if (extra) { extra.driver = 'none'; extra.speed = 0; }
  }
}

function spawnCop() {
  const p = S.player;
  const a = rand(0, Math.PI * 2);
  const r = rand(420, 560);
  const spot = nearestRoadPoint(
    clamp(p.x + Math.cos(a) * r, 80, WORLD_W - 80),
    clamp(p.y + Math.sin(a) * r, 80, WORLD_H - 80),
  );
  S.cops.push({ x: spot.x, y: spot.y, angle: 0, speed: 0, touchT: 0 });
}

function spawnCruiser() {
  const p = S.player;
  // Come up BEHIND the player: a cruiser dropped in front meets them
  // head-on within a second or two and pins the car before it can get
  // up to speed. Chasing from behind gives the player a straight to
  // build speed on first.
  const facing = p.car ? p.car.angle : p.angle;
  const bearing = facing + Math.PI + rand(-0.5, 0.5);
  // Start far out (800-1000): at 500-650 the cruiser is on a player who
  // is still accelerating in ~3s and rams them before they reach speed.
  const range = rand(800, 1000);
  let spot = nearestRoadPoint(
    clamp(p.x + Math.cos(bearing) * range, 80, WORLD_W - 80),
    clamp(p.y + Math.sin(bearing) * range, 80, WORLD_H - 80),
  );
  // Snapping to a road can drag the spot far closer than `range` (e.g.
  // onto the player's own road, right behind them), so nudge it back
  // out along the same bearing until it is at least 700 away.
  let gap = dist(spot.x, spot.y, p.x, p.y);
  for (let tries = 0; gap < 700 && tries < 8; tries++) {
    const extra = 700 - gap + 50;
    spot = nearestRoadPoint(
      clamp(spot.x + Math.cos(bearing) * extra, 80, WORLD_W - 80),
      clamp(spot.y + Math.sin(bearing) * extra, 80, WORLD_H - 80),
    );
    gap = dist(spot.x, spot.y, p.x, p.y);
  }
  const car = makeCar('police', spot.x, spot.y, Math.atan2(p.y - spot.y, p.x - spot.x), 'police');
  car.speed = 120;
  S.cars.push(car);
}

export function updatePolice(dt) {
  const p = S.player;
  if (!p) return;
  const stars = Math.floor(S.wantedHeat);
  // Foot cops chase the player; touching for 0.8s while wanted = BUSTED.
  for (const cop of S.cops) {
    const d = dist(cop.x, cop.y, p.x, p.y);
    // Foot cops are a threat on foot (quicker than the 150 walk, slower
    // than the 250 sprint) but must not keep up with a car: city driving
    // averages ~150-170 on twisty roads, so the old 175/205 speeds let
    // cops tail a car forever and arrest the driver at a corner. The
    // cruisers are the 3-star threat, not foot cops outrunning cars.
    // (At 1 star, 130 is slower than walking — those cops only catch a
    // player who stands still. That is the price of cars outrunning them.)
    const speed = stars >= 5 ? 185 : stars >= 3 ? 140 : 130;
    if (d > 26) {
      cop.angle = Math.atan2(p.y - cop.y, p.x - cop.x);
      cop.x += Math.cos(cop.angle) * speed * dt;
      cop.y += Math.sin(cop.angle) * speed * dt;
      cop.speed = speed;
    } else {
      cop.speed = 0;
    }
    resolveBuildingCollision(cop, 12);
    if (stars >= 1 && d < 30 && p.hp > 0) {
      cop.touchT += dt;
      if (cop.touchT >= 0.8) {
        S.mode = 'busted';
        S.cash = Math.max(0, S.cash - 100);
        S.wantedHeat = 0;
        S.cops = [];
        S.arrestT = 0;
        addFloatText(p.x, p.y - 30, '-$100 bail', '#ff6b6b');
        return;
      }
    } else {
      cop.touchT = 0;
    }
  }
  // Cruisers chase and ram the player's car.
  for (const car of S.cars) {
    if (car.driver !== 'police' || car.dead) continue;
    const d = dist(car.x, car.y, p.x, p.y);
    const top = stars >= 5 ? car.top + 30 : car.top;
    const want = Math.atan2(p.y - car.y, p.x - car.x);
    let diff = want - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    car.angle += clamp(diff, -car.turn * dt, car.turn * dt);
    car.speed = clamp(car.speed + car.accel * dt, 0, top);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    // Ramming grinds the player's car at 3 hp/s (was 5): at 5 hp/s a
    // sports car lost ~78hp just dropping from 3.5 to 3.0 stars on the
    // beach and arrived at ~2hp, dying to the next stray touch before
    // the heat finished decaying. At 3 hp/s it reaches the cruiser
    // retirement point with ~30hp left.
    // Only the ramming cruiser loses speed here. Cutting the player's
    // speed every frame per cruiser in contact multiplies it by ~0.96
    // per frame with two cruisers and pins the car near zero, so it can
    // never pull away and the foot cops arrest the driver. The speed
    // trade-off lives in collideCars (cruiser bounces off, player keeps
    // 85%); the ram's job is HP damage.
    if (p.car && !p.car.dead && d < 46) {
      damageCar(p.car, 3 * dt);
      car.speed *= 1 - 1.6 * dt;
      if (Math.random() < dt * 4) spawnSparks(car.x, car.y);
    }
    car.x = clamp(car.x, 30, WORLD_W - 30);
    car.y = clamp(car.y, 30, WORLD_H - 30);
  }
  // Busted cleanup happens in main.js when the mode changes.
}

export function drawPolice(ctx) {
  for (const cop of S.cops) {
    ctx.save();
    ctx.translate(cop.x, cop.y);
    ctx.rotate(cop.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 3, 10, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a3a6b'; // navy uniform
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2c89b';
    ctx.beginPath();
    ctx.arc(5, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a3a6b';
    ctx.fillRect(6, -7, 5, 14);
    ctx.restore();
    // Arrest progress ring while touching the player.
    if (cop.touchT > 0) {
      ctx.strokeStyle = '#ff4444';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cop.x, cop.y, 18, -Math.PI / 2, -Math.PI / 2 + (cop.touchT / 0.8) * Math.PI * 2);
      ctx.stroke();
    }
  }
}
