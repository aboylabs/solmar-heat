// Pedestrians: sidewalk walkers who stroll, wait, and flee from gunshots
// and from speeding cars.
import { S, clamp, dist, rand, pick, WORLD_W, WORLD_H } from './util.js';
import { V_ROADS, H_ROADS, resolveBuildingCollision } from './city.js';

const SHIRT_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#ecf0f1'];

export function spawnPedestrians(count) {
  for (let i = 0; i < count; i++) {
    S.peds.push(makePed(rand(120, WORLD_W - 120), rand(120, WORLD_H - 120)));
  }
}

export function makePed(x, y) {
  return {
    x, y, angle: rand(0, Math.PI * 2), speed: 0,
    color: pick(SHIRT_COLORS),
    targetX: x, targetY: y, waitT: rand(0, 2),
    fleeT: 0, stolen: false,
  };
}

export function scarePeds(x, y, radius) {
  for (const ped of S.peds) {
    if (dist(ped.x, ped.y, x, y) < radius) {
      ped.fleeT = rand(2, 3.5);
      ped.targetX = ped.x + (ped.x - x) * 2;
      ped.targetY = ped.y + (ped.y - y) * 2;
    }
  }
}

function pickStrollTarget(ped) {
  // Walk along a sidewalk: pick a point on a nearby road's edge.
  const vertical = Math.random() < 0.5;
  if (vertical) {
    const road = pick(V_ROADS);
    ped.targetX = road + (Math.random() < 0.5 ? -84 : 84);
    ped.targetY = clamp(ped.y + rand(-400, 400), 80, WORLD_H - 80);
  } else {
    const road = pick(H_ROADS);
    ped.targetX = clamp(ped.x + rand(-400, 400), 80, WORLD_W - 80);
    ped.targetY = road + (Math.random() < 0.5 ? -84 : 84);
  }
}

export function updatePedestrians(dt) {
  const p = S.player;
  for (const ped of S.peds) {
    if (ped.fleeT > 0) ped.fleeT -= dt;
    // Flee from a speeding car bearing down on them.
    if (p && !p.onFoot && p.car && Math.abs(p.car.speed) > 160) {
      if (dist(ped.x, ped.y, p.car.x, p.car.y) < 130 && ped.fleeT <= 0) {
        ped.fleeT = 2;
        ped.targetX = ped.x + (ped.x - p.car.x) * 2;
        ped.targetY = ped.y + (ped.y - p.car.y) * 2;
      }
    }
    const dx = ped.targetX - ped.x;
    const dy = ped.targetY - ped.y;
    const d = Math.hypot(dx, dy);
    if (d < 12) {
      ped.speed = 0;
      if (ped.fleeT <= 0) {
        ped.waitT -= dt;
        if (ped.waitT <= 0) {
          pickStrollTarget(ped);
          ped.waitT = rand(0, 3);
        }
      } else {
        pickStrollTarget(ped);
      }
      continue;
    }
    const speed = ped.fleeT > 0 ? 200 : 62;
    ped.angle = Math.atan2(dy, dx);
    ped.x += (dx / d) * speed * dt;
    ped.y += (dy / d) * speed * dt;
    ped.speed = speed;
    ped.x = clamp(ped.x, 30, WORLD_W - 30);
    ped.y = clamp(ped.y, 30, WORLD_H - 30);
    resolveBuildingCollision(ped, 12);
  }
  // Keep the streets populated.
  if (S.peds.length < 22 && Math.random() < dt * 0.4) {
    const px = clamp(p.x + rand(-500, 500), 100, WORLD_W - 100);
    const py = clamp(p.y + rand(-500, 500), 100, WORLD_H - 100);
    S.peds.push(makePed(px, py));
  }
}

export function drawPedestrians(ctx) {
  for (const ped of S.peds) {
    ctx.save();
    ctx.translate(ped.x, ped.y);
    ctx.rotate(ped.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 3, 10, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ped.color;
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2c89b';
    ctx.beginPath();
    ctx.arc(4, 0, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
