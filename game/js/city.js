// Solmar City: districts, the road grid, buildings, palms, the beach and
// sea, shops, the vault, the docks, and all static collision tests.
// Layout is generated once from a fixed seed so it is identical every load.
import { S, WORLD_W, WORLD_H, makeRng, clamp } from './util.js';

export const ROAD_W = 120;
export const V_ROADS = [400, 1000, 1600, 2200, 2800];
export const H_ROADS = [400, 900, 1400, 1900];
export const BEACH_X = 2920; // sand starts here
export const SEA_X = 3080; // water starts here

export const DISTRICTS = [
  { name: 'Downtown', x: 900, y: 300, w: 1300, h: 600, tint: '#e8dcc8' },
  { name: 'Marina', x: 2300, y: 300, w: 900, h: 600, tint: '#d8e8e0' },
  { name: 'Old Town', x: 300, y: 1000, w: 1200, h: 800, tint: '#ead9c2' },
  { name: 'Hills', x: 1600, y: 1000, w: 1300, h: 800, tint: '#dce8c8' },
  { name: 'Docks', x: 300, y: 1900, w: 1200, h: 500, tint: '#d8d4cc' },
  { name: 'Beach', x: 2300, y: 1900, w: 900, h: 500, tint: '#f2e2b8' },
];

const PALETTE = ['#f2b8a0', '#f7d08a', '#a8d8d0', '#f2a0b8', '#d8c8f0', '#f0e0b8', '#b8d8a8', '#e8a8a8'];

export function buildCity() {
  const rng = makeRng(20261117);
  S.buildings = [];
  S.palms = [];
  // One or two buildings per city block (the space between roads).
  const xs = [60, ...V_ROADS.map((v) => v + ROAD_W / 2), WORLD_W - 60];
  const ys = [60, ...H_ROADS.map((v) => v + ROAD_W / 2), WORLD_H - 60];
  for (let bi = 0; bi < xs.length - 1; bi++) {
    for (let bj = 0; bj < ys.length - 1; bj++) {
      const x0 = xs[bi] + 26;
      const y0 = ys[bj] + 26;
      // xs[bi+1] / ys[bj+1] sit on the FAR side of the next road (road
      // centre + half the road width), so stopping 26 short of them still
      // leaves the block overlapping that road. Pull the block back by a
      // full road width so buildings end at the road's NEAR edge.
      const x1 = xs[bi + 1] - ROAD_W - 26;
      const y1 = ys[bj + 1] - ROAD_W - 26;
      if (x1 - x0 < 90 || y1 - y0 < 90) continue;
      if (x0 > BEACH_X - 40) continue; // beach stays open
      // Docks block (south-west) stays mostly open for the shootout.
      if (x0 < 1500 && y0 > 1900) continue;
      const count = rng() < 0.5 ? 1 : 2;
      for (let k = 0; k < count; k++) {
        const w = Math.min(x1 - x0, 120 + rng() * 150);
        const h = Math.min(y1 - y0, 100 + rng() * 130);
        const bx = x0 + (count === 1 ? (x1 - x0 - w) / 2 : k * (x1 - x0 - w));
        const by = y0 + rng() * Math.max(1, y1 - y0 - h);
        S.buildings.push({
          x: bx, y: by, w, h,
          color: PALETTE[Math.floor(rng() * PALETTE.length)],
          roof: rng() < 0.3,
        });
      }
    }
  }
  // Palm trees along the beach and scattered on sidewalks.
  for (let y = 120; y < WORLD_H - 60; y += 130) {
    S.palms.push({ x: BEACH_X + 30 + rng() * 60, y: y + rng() * 60 });
    S.palms.push({ x: BEACH_X - 40 + rng() * 20, y: y + 60 + rng() * 40 });
  }
  for (let i = 0; i < 40; i++) {
    const rx = V_ROADS[Math.floor(rng() * V_ROADS.length)] + (rng() < 0.5 ? -88 : 88);
    const ry = 120 + rng() * (WORLD_H - 240);
    if (rx < BEACH_X) S.palms.push({ x: rx, y: ry });
  }
  // Shops: gun store near the Marina road, spray shop in Old Town.
  S.shops = [
    { kind: 'gun', name: 'Ironworks Arms', x: 2380, y: 560, doorX: 2340, doorY: 620 },
    { kind: 'spray', name: 'Solmar Spray Shop', x: 620, y: 1560, doorX: 660, doorY: 1620 },
  ];
  // Solmar Reserve vault, downtown.
  S.vault = { x: 1600, y: 900, name: 'Solmar Reserve' };
  // Docks deal spot, south-west corner.
  S.docks = { x: 560, y: 2140 };
  // 10 hidden cash packages, spread across districts.
  const pkgSpots = [
    [340, 340], [1560, 340], [2760, 340], [340, 860], [2160, 860],
    [960, 1360], [2760, 1360], [340, 1860], [1560, 1860], [2760, 2160],
  ];
  S.packages = pkgSpots.map(([x, y]) => ({ x, y, taken: false }));
  S.healthPickups = [];
}

// --- collision helpers -------------------------------------------------
export function onRoad(x, y) {
  for (const vx of V_ROADS) if (Math.abs(x - vx) < ROAD_W / 2 + 8) return true;
  for (const hy of H_ROADS) if (Math.abs(y - hy) < ROAD_W / 2 + 8) return true;
  return false;
}
export function onBeach(x, y) { return x > BEACH_X && x < SEA_X; }
export function inSea(x, y) { return x >= SEA_X; }

// Circle (radius r) vs buildings: returns the building hit, or null.
export function buildingHit(x, y, r) {
  for (const b of S.buildings) {
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return b;
  }
  return null;
}

// Push a circle out of buildings and the sea; returns true if it collided.
export function resolveBuildingCollision(e, r) {
  let hit = false;
  for (const b of S.buildings) {
    const cx = clamp(e.x, b.x, b.x + b.w);
    const cy = clamp(e.y, b.y, b.y + b.h);
    const dx = e.x - cx;
    const dy = e.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 0.01) {
        const d = Math.sqrt(d2);
        e.x = cx + (dx / d) * r;
        e.y = cy + (dy / d) * r;
      } else {
        e.x += r;
      }
    }
  }
  if (e.x > SEA_X - r) { e.x = SEA_X - r; hit = true; }
  e.x = clamp(e.x, r, WORLD_W - r);
  e.y = clamp(e.y, r, WORLD_H - r);
  return hit;
}

export function nearestRoadPoint(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const vx of V_ROADS) {
    const d = Math.abs(x - vx);
    if (d < bestD) { bestD = d; best = { x: vx, y }; }
  }
  for (const hy of H_ROADS) {
    const d = Math.abs(y - hy);
    if (d < bestD) { bestD = d; best = { x, y: hy }; }
  }
  return best;
}

export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h) return d.name;
  }
  return x > BEACH_X ? 'Beach' : 'Solmar City';
}

// --- drawing ------------------------------------------------------------
export function drawCity(ctx, camX, camY, vw, vh) {
  const x0 = Math.max(0, camX - 40);
  const y0 = Math.max(0, camY - 40);
  const x1 = Math.min(WORLD_W, camX + vw + 40);
  const y1 = Math.min(WORLD_H, camY + vh + 40);
  // Ground: warm sand-grass base, district tints.
  ctx.fillStyle = '#e9d9a8';
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  for (const d of DISTRICTS) {
    if (d.x + d.w < x0 || d.x > x1 || d.y + d.h < y0 || d.y > y1) continue;
    ctx.fillStyle = d.tint;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(d.x, d.y, d.w, d.h);
    ctx.globalAlpha = 1;
  }
  // Beach sand + turquoise sea on the east edge.
  ctx.fillStyle = '#f4e3b0';
  ctx.fillRect(Math.max(BEACH_X, x0), y0, Math.min(SEA_X, x1) - Math.max(BEACH_X, x0), y1 - y0);
  ctx.fillStyle = '#3fc4c8';
  ctx.fillRect(Math.max(SEA_X, x0), y0, x1 - Math.max(SEA_X, x0), y1 - y0);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (let y = Math.floor(y0 / 90) * 90; y < y1; y += 90) {
    ctx.fillRect(Math.max(SEA_X, x0), y, 60, 4);
  }
  // Sidewalks (light border around each road).
  ctx.fillStyle = '#d9cba6';
  for (const vx of V_ROADS) ctx.fillRect(vx - ROAD_W / 2 - 14, y0, ROAD_W + 28, y1 - y0);
  for (const hy of H_ROADS) ctx.fillRect(x0, hy - ROAD_W / 2 - 14, x1 - x0, ROAD_W + 28);
  // Asphalt roads.
  ctx.fillStyle = '#3d3a38';
  for (const vx of V_ROADS) ctx.fillRect(vx - ROAD_W / 2, y0, ROAD_W, y1 - y0);
  for (const hy of H_ROADS) ctx.fillRect(x0, hy - ROAD_W / 2, x1 - x0, ROAD_W);
  // Lane markings.
  ctx.fillStyle = '#f7d774';
  for (const vx of V_ROADS) {
    for (let y = Math.floor(y0 / 60) * 60; y < y1; y += 60) ctx.fillRect(vx - 2, y, 4, 30);
  }
  for (const hy of H_ROADS) {
    for (let x = Math.floor(x0 / 60) * 60; x < x1; x += 60) ctx.fillRect(x, hy - 2, 30, 4);
  }
  // Crosswalks at intersections.
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (const vx of V_ROADS) {
    for (const hy of H_ROADS) {
      for (let i = -2; i <= 2; i++) {
        ctx.fillRect(vx + i * 20 - 6, hy - ROAD_W / 2 - 8, 12, 8);
        ctx.fillRect(vx + i * 20 - 6, hy + ROAD_W / 2, 12, 8);
      }
    }
  }
  // Buildings with roof detail and windows.
  for (const b of S.buildings) {
    if (b.x + b.w < x0 || b.x > x1 || b.y + b.h < y0 || b.y > y1) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(b.x + 6, b.y + 8, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    const cols = Math.max(1, Math.floor(b.w / 46));
    const rows = Math.max(1, Math.floor(b.h / 46));
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        ctx.fillRect(b.x + 12 + i * ((b.w - 24) / cols), b.y + 12 + j * ((b.h - 24) / rows), 14, 18);
      }
    }
    if (b.roof) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(b.x + 8, b.y + 8, b.w - 16, b.h - 16);
    }
  }
  // Shop fronts.
  for (const s of S.shops) {
    ctx.fillStyle = s.kind === 'gun' ? '#5a3a28' : '#2a5a6a';
    ctx.fillRect(s.x - 70, s.y - 46, 140, 92);
    ctx.fillStyle = '#f7e8c8';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(s.name, s.x, s.y - 52);
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(s.x - 22, s.y + 10, 44, 36);
  }
  // Vault building (Solmar Reserve).
  if (S.vault) {
    ctx.fillStyle = '#8a7a5a';
    ctx.fillRect(S.vault.x - 90, S.vault.y - 60, 180, 120);
    ctx.fillStyle = '#e8d9a0';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SOLMAR RESERVE', S.vault.x, S.vault.y - 68);
    ctx.fillStyle = '#3a3226';
    ctx.fillRect(S.vault.x - 26, S.vault.y - 10, 52, 40);
  }
  // Palm trees.
  for (const p of S.palms) {
    if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
    ctx.strokeStyle = '#8a6a42';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 3, p.y - 18);
    ctx.stroke();
    ctx.fillStyle = '#3f9e4d';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.4;
      ctx.beginPath();
      ctx.ellipse(p.x + 3 + Math.cos(a) * 12, p.y - 20 + Math.sin(a) * 8, 14, 5, a, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Cash packages (glowing green cases).
  for (const pkg of S.packages) {
    if (pkg.taken) continue;
    ctx.fillStyle = '#2ecc71';
    ctx.beginPath();
    ctx.arc(pkg.x, pkg.y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText('$', pkg.x, pkg.y + 5);
  }
  // Health pickups (white cross).
  for (const hp of S.healthPickups) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(hp.x - 12, hp.y - 4, 24, 8);
    ctx.fillRect(hp.x - 4, hp.y - 12, 8, 24);
    ctx.strokeStyle = '#e74c3c';
    ctx.lineWidth = 2;
    ctx.strokeRect(hp.x - 13, hp.y - 13, 26, 26);
  }
}
