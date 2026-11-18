// Save / load through localStorage.
import { S } from './util.js';

export const SAVE_KEY = 'solmar-heat-save';

export function saveGame() {
  const p = S.player;
  if (!p) return false;
  const data = {
    cash: S.cash,
    missionsDone: S.missionsDone,
    missionIndex: S.missionIndex,
    x: p.x, y: p.y,
    hp: p.hp,
    hasPistol: p.hasPistol,
    ammo: p.ammo,
    timeMin: S.timeMin,
    packages: S.packages.filter((k) => k.taken).length,
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

export function hasSave() {
  return loadSave() !== null;
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
}
