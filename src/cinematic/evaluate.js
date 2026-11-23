/**
 * Deterministic cinematic camera evaluation (Phase 6).
 * Same math is mirrored in storyboard + threejs scene templates.
 */

import { CAMERA_MOVES, CAMERA_EASES } from './presets.js';

export function easeCamera(t, name = 'ease-in-out') {
  const x = Math.min(1, Math.max(0, t));
  switch (name) {
    case 'linear':
      return x;
    case 'ease-in':
      return x * x * x;
    case 'ease-out':
      return 1 - Math.pow(1 - x, 3);
    case 'ease-in-out':
    default:
      return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  }
}

/**
 * @param {object} camera visualIntent.camera
 * @param {number} p shot-local progress 0..1
 * @param {number} t absolute time seconds (for handheld)
 * @returns {{zoom:number, panX:number, panY:number, roll:number, fov:number}}
 */
export function evaluateCamera(camera = {}, p = 0, t = 0) {
  const move = CAMERA_MOVES.includes(camera.move) ? camera.move : 'static';
  const easeName = CAMERA_EASES.includes(camera.ease) ? camera.ease : 'ease-in-out';
  const intensity = Number.isFinite(camera.intensity) ? camera.intensity : 0.5;
  const e = easeCamera(p, easeName);
  const baseZoom = Number.isFinite(camera.zoom) ? camera.zoom : 1;
  const basePanX = Number.isFinite(camera.panX) ? camera.panX : 0;
  const basePanY = Number.isFinite(camera.panY) ? camera.panY : 0;
  const baseRoll = Number.isFinite(camera.roll) ? camera.roll : 0;
  const baseFov = Number.isFinite(camera.fov) ? camera.fov : 45;

  // Explicit keyframes override procedural move
  if (camera.from && camera.to) {
    const a = camera.from;
    const b = camera.to;
    return {
      zoom: lerp(num(a.zoom, baseZoom), num(b.zoom, baseZoom), e),
      panX: lerp(num(a.panX, basePanX), num(b.panX, basePanX), e),
      panY: lerp(num(a.panY, basePanY), num(b.panY, basePanY), e),
      roll: lerp(num(a.roll, baseRoll), num(b.roll, baseRoll), e),
      fov: lerp(num(a.fov, baseFov), num(b.fov, baseFov), e)
    };
  }

  let zoom = baseZoom;
  let panX = basePanX;
  let panY = basePanY;
  let roll = baseRoll;
  let fov = baseFov;
  const k = intensity;

  switch (move) {
    case 'dolly-in':
      zoom = lerp(baseZoom * (1 - 0.12 * k), baseZoom * (1 + 0.14 * k), e);
      fov = lerp(baseFov + 4 * k, baseFov - 5 * k, e);
      break;
    case 'dolly-out':
      zoom = lerp(baseZoom * (1 + 0.1 * k), baseZoom * (1 - 0.1 * k), e);
      fov = lerp(baseFov - 3 * k, baseFov + 5 * k, e);
      break;
    case 'orbit-left':
      panX = basePanX + lerp(0.08 * k, -0.08 * k, e);
      panY = basePanY + Math.sin(e * Math.PI) * 0.02 * k;
      break;
    case 'orbit-right':
      panX = basePanX + lerp(-0.08 * k, 0.08 * k, e);
      panY = basePanY + Math.sin(e * Math.PI) * 0.02 * k;
      break;
    case 'crane-up':
      panY = basePanY + lerp(0.06 * k, -0.07 * k, e);
      zoom = lerp(baseZoom * 0.98, baseZoom * 1.04, e);
      break;
    case 'crane-down':
      panY = basePanY + lerp(-0.05 * k, 0.06 * k, e);
      break;
    case 'handheld':
      panX = basePanX + Math.sin(t * 7.3) * 0.012 * k + Math.sin(t * 3.1) * 0.006 * k;
      panY = basePanY + Math.cos(t * 6.1) * 0.01 * k;
      roll = baseRoll + Math.sin(t * 5.2) * 0.8 * k;
      zoom = baseZoom * (1 + Math.sin(t * 4.4) * 0.01 * k);
      break;
    case 'push-slide':
      panX = basePanX + lerp(-0.05 * k, 0.04 * k, e);
      zoom = lerp(baseZoom * 0.97, baseZoom * 1.06, e);
      break;
    case 'whip-pan':
      panX = basePanX + (e < 0.15 || e > 0.85 ? Math.sin(t * 30) * 0.04 * k : lerp(-0.12 * k, 0.12 * k, e));
      roll = baseRoll + (e < 0.2 ? (1 - e / 0.2) * 3 * k : 0);
      break;
    case 'static':
    default:
      break;
  }

  return {
    zoom: Number(zoom.toFixed(5)),
    panX: Number(panX.toFixed(5)),
    panY: Number(panY.toFixed(5)),
    roll: Number(roll.toFixed(5)),
    fov: Number(fov.toFixed(3))
  };
}

function num(v, fallback) {
  return Number.isFinite(v) ? v : fallback;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function normalizeCamera(raw = {}, fallback = {}) {
  const move = CAMERA_MOVES.includes(raw.move) ? raw.move : fallback.move || 'static';
  const ease = CAMERA_EASES.includes(raw.ease) ? raw.ease : fallback.ease || 'ease-in-out';
  return {
    move,
    ease,
    intensity: Number.isFinite(raw.intensity) ? raw.intensity : fallback.intensity ?? 0.5,
    zoom: Number.isFinite(raw.zoom) ? raw.zoom : fallback.zoom ?? 1,
    panX: Number.isFinite(raw.panX) ? raw.panX : fallback.panX ?? 0,
    panY: Number.isFinite(raw.panY) ? raw.panY : fallback.panY ?? 0,
    roll: Number.isFinite(raw.roll) ? raw.roll : fallback.roll ?? 0,
    fov: Number.isFinite(raw.fov) ? raw.fov : fallback.fov ?? 45,
    from: raw.from || fallback.from || null,
    to: raw.to || fallback.to || null
  };
}
