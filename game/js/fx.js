// Particles, floating text, skid marks and screen shake.
import { S, clamp, rand } from './util.js';

export function spawnParticles(x, y, n, color, speed) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2);
    const s = rand(speed * 0.3, speed);
    S.particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: rand(0.3, 0.8), max: 0.8, size: rand(2, 5), color,
    });
  }
  if (S.particles.length > 400) S.particles.splice(0, S.particles.length - 400);
}

export function spawnBlood(x, y) { spawnParticles(x, y, 10, '#c0392b', 160); }
export function spawnSparks(x, y) { spawnParticles(x, y, 8, '#f5c542', 220); }
export function spawnSmoke(x, y) { spawnParticles(x, y, 5, '#888888', 60); }

export function addFloatText(x, y, text, color) {
  S.floats.push({ x, y, text, color: color || '#ffffff', life: 1.4 });
  if (S.floats.length > 30) S.floats.shift();
}

export function addSkid(x, y, angle) {
  S.skids.push({ x, y, angle, life: 6 });
  if (S.skids.length > 300) S.skids.shift();
}

export function addShake(amount) {
  S.shake = Math.min(18, S.shake + amount);
}

export function updateFx(dt) {
  for (let i = S.particles.length - 1; i >= 0; i--) {
    const p = S.particles[i];
    p.life -= dt;
    if (p.life <= 0) { S.particles.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.94; p.vy *= 0.94;
  }
  for (let i = S.floats.length - 1; i >= 0; i--) {
    const f = S.floats[i];
    f.life -= dt;
    f.y -= 34 * dt;
    if (f.life <= 0) S.floats.splice(i, 1);
  }
  for (let i = S.skids.length - 1; i >= 0; i--) {
    S.skids[i].life -= dt;
    if (S.skids[i].life <= 0) S.skids.splice(i, 1);
  }
  S.shake = Math.max(0, S.shake - dt * 26);
}

export function drawFx(ctx, camX, camY) {
  // Skid marks (dark, under everything else that moves).
  ctx.save();
  ctx.strokeStyle = 'rgba(20,20,20,0.45)';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  for (const s of S.skids) {
    ctx.globalAlpha = clamp(s.life / 6, 0, 0.6);
    ctx.beginPath();
    ctx.moveTo(s.x - Math.cos(s.angle) * 7, s.y - Math.sin(s.angle) * 7);
    ctx.lineTo(s.x + Math.cos(s.angle) * 7, s.y + Math.sin(s.angle) * 7);
    ctx.stroke();
  }
  ctx.restore();
  // Particles.
  for (const p of S.particles) {
    ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
  // Floating text.
  ctx.textAlign = 'center';
  ctx.font = 'bold 15px system-ui, sans-serif';
  for (const f of S.floats) {
    ctx.globalAlpha = clamp(f.life, 0, 1);
    ctx.fillStyle = f.color;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 3;
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}
