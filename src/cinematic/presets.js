/**
 * Phase 6 cinematic camera presets.
 * Moves are evaluated over each shot's local progress p in [0,1].
 */

export const CAMERA_MOVES = [
  'static',
  'dolly-in',
  'dolly-out',
  'orbit-left',
  'orbit-right',
  'crane-up',
  'crane-down',
  'handheld',
  'push-slide',
  'whip-pan'
];

export const CAMERA_EASES = ['linear', 'ease-in', 'ease-out', 'ease-in-out'];

/** Narrative role → default cinematic camera language */
export const ROLE_CAMERA = Object.freeze({
  hook: { move: 'dolly-in', ease: 'ease-out', intensity: 0.85, fov: 42 },
  setup: { move: 'push-slide', ease: 'ease-in-out', intensity: 0.45, fov: 46 },
  development: { move: 'orbit-right', ease: 'ease-in-out', intensity: 0.4, fov: 45 },
  escalation: { move: 'handheld', ease: 'linear', intensity: 0.7, fov: 40 },
  climax: { move: 'dolly-in', ease: 'ease-in', intensity: 1.0, fov: 38 },
  resolution: { move: 'crane-up', ease: 'ease-out', intensity: 0.5, fov: 48 },
  conclusion: { move: 'dolly-out', ease: 'ease-in-out', intensity: 0.55, fov: 50 }
});
