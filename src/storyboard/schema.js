/**
 * Phase 3–6 visual-intent / storyboard schema helpers.
 */
import { MOTIFS, TRANSITIONS, TYPE_STYLES, FX_FLAGS } from '../visuals2d/presets.js';
import { normalizeCamera } from '../cinematic/evaluate.js';
import { CAMERA_MOVES } from '../cinematic/presets.js';

export const MOODS = ['curious', 'calm', 'intense', 'triumphant', 'reflective', 'urgent'];
export const LAYOUTS = ['title-hero', 'split-focus', 'center-focus', 'callout', 'closing', 'kinetic'];
export const MOTIONS = ['rise', 'orbit', 'pulse', 'sweep', 'fade', 'impact'];
export { MOTIFS, TRANSITIONS, TYPE_STYLES, FX_FLAGS, CAMERA_MOVES };

export const PALETTES = Object.freeze({
  curious: { bg0: '#0b1220', bg1: '#151b3a', accent: '#6ea8ff', text: '#ffffff', muted: '#9eb6ff' },
  calm: { bg0: '#0a1412', bg1: '#123028', accent: '#5ddeb4', text: '#f2fffb', muted: '#8fd9c4' },
  intense: { bg0: '#14080c', bg1: '#2a0f18', accent: '#ff5d7a', text: '#ffffff', muted: '#ffb3c0' },
  triumphant: { bg0: '#141008', bg1: '#2a220f', accent: '#ffc857', text: '#fff8e8', muted: '#ffe2a0' },
  reflective: { bg0: '#0c0e16', bg1: '#171c2c', accent: '#a78bfa', text: '#f5f3ff', muted: '#c4b5fd' },
  urgent: { bg0: '#160d05', bg1: '#2c1708', accent: '#ff8a3d', text: '#fff4ec', muted: '#ffc19a' }
});

export function paletteFor(mood) {
  const key = MOODS.includes(mood) ? mood : 'curious';
  return { ...PALETTES[key] };
}

function pickFrom(list, value, fallback) {
  return list.includes(value) ? value : fallback;
}

/**
 * Normalize a visual intent into the Phase 3/4 contract.
 */
export function normalizeVisualIntent(raw = {}, fallback = {}) {
  const mood = MOODS.includes(raw.mood) ? raw.mood : fallback.mood || 'curious';
  const layout = LAYOUTS.includes(raw.layout) ? raw.layout : fallback.layout || 'center-focus';
  const motion = MOTIONS.includes(raw.motion) ? raw.motion : fallback.motion || 'rise';
  const palette = raw.palette && raw.palette.accent ? raw.palette : paletteFor(mood);

  const motif = pickFrom(MOTIFS, raw.motif, fallback.motif || 'geometric');
  const transition = pickFrom(TRANSITIONS, raw.transition, fallback.transition || 'soft-fade');
  const typography = pickFrom(TYPE_STYLES, raw.typography, fallback.typography || 'display');
  const fxRaw = Array.isArray(raw.fx) ? raw.fx : fallback.fx || ['glow', 'vignette'];
  const fx = [...new Set(fxRaw.filter((f) => FX_FLAGS.includes(f)))];

  return {
    type: 'storyboard',
    version: '6.0',
    mood,
    layout,
    motion,
    motif,
    transition,
    typography,
    fx,
    palette,
    emphasis: Array.isArray(raw.emphasis) ? raw.emphasis.slice(0, 6) : fallback.emphasis || [],
    visualPrompt: String(raw.visualPrompt || fallback.visualPrompt || '').slice(0, 400),
    camera: normalizeCamera(raw.camera || {}, fallback.camera || {}),
    elements: Array.isArray(raw.elements) ? raw.elements : fallback.elements || [],
    confidence: Number.isFinite(raw.confidence) ? raw.confidence : fallback.confidence ?? 0.6,
    planner: raw.planner || fallback.planner || 'heuristic'
  };
}

export function validateStoryboard(storyboard) {
  const errors = [];
  const warnings = [];
  if (!storyboard || typeof storyboard !== 'object') {
    return { valid: false, errors: [{ code: 'NOT_OBJECT', message: 'Storyboard must be an object' }], warnings: [] };
  }
  if (!['3.0', '4.0', '6.0'].includes(storyboard.version)) {
    warnings.push({ code: 'VERSION', message: `Unexpected storyboard version ${storyboard.version}` });
  }
  if (!Array.isArray(storyboard.shots) || !storyboard.shots.length) {
    errors.push({ code: 'NO_SHOTS', message: 'Storyboard has no shots' });
  }
  const ids = new Set();
  for (const shot of storyboard.shots || []) {
    if (!shot.sceneId) errors.push({ code: 'SHOT_SCENE', message: 'Shot missing sceneId' });
    if (ids.has(shot.sceneId)) errors.push({ code: 'SHOT_DUP', message: `Duplicate sceneId ${shot.sceneId}` });
    ids.add(shot.sceneId);
    if (!shot.visualIntent || shot.visualIntent.type !== 'storyboard') {
      errors.push({ code: 'INTENT', message: `Shot ${shot.sceneId} missing storyboard visualIntent` });
    }
  }
  return { valid: errors.length === 0, errors, warnings };
}
