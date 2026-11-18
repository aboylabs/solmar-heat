// Keyboard + mouse input. Tracks held keys, the mouse position in screen
// space, clicks (consumed once), and a queue of single-press actions.
export const keys = {};
export const mouse = { x: 0, y: 0, down: false, clicked: false, clickX: 0, clickY: 0 };
const pressed = {}; // keys pressed this frame (edge-triggered)
let canvasEl = null;

export function initInput(canvas) {
  canvasEl = canvas;
  window.addEventListener('keydown', (e) => {
    // Normalize to lowercase so multi-char keys match the game's checks:
    // 'Enter' -> 'enter', 'Shift' -> 'shift', 'ArrowUp' -> 'arrowup'.
    const k = e.key.toLowerCase();
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    if (!keys[k]) pressed[k] = true;
    keys[k] = true;
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    keys[k] = false;
  });
  window.addEventListener('blur', () => {
    for (const k in keys) keys[k] = false;
  });
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      mouse.down = true;
      mouse.clicked = true;
      mouse.clickX = mouse.x;
      mouse.clickY = mouse.y;
    }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

export function keyDown(k) { return !!keys[k]; }
// True only on the frame the key went down; consumed by endFrame().
export function keyPressed(k) { return !!pressed[k]; }
export function anyKeyPressed() { return Object.keys(pressed).length > 0; }
export function consumeClick() {
  const c = mouse.clicked;
  mouse.clicked = false;
  return c;
}
export function endFrame() {
  for (const k in pressed) delete pressed[k];
  mouse.clicked = false;
}
export function canvasSize() {
  return canvasEl ? { w: canvasEl.width, h: canvasEl.height } : { w: 1280, h: 800 };
}
