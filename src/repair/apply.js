/**
 * Apply Phase 8 repair actions onto a storyboard (immutable → new object).
 */
import { normalizeVisualIntent, paletteFor } from '../storyboard/schema.js';
import { BRIGHT_PALETTES, ACTIVE_MOTIFS, ACTIVE_MOTIONS, ACTIVE_CAMERAS } from './strategies.js';

/**
 * @param {object} storyboard
 * @param {import('./strategies.js').RepairAction[]} actions
 * @param {{attempt?:number}} [opts]
 */
export function applyRepairActions(storyboard, actions, { attempt = 1 } = {}) {
  if (!storyboard?.shots?.length || !actions?.length) {
    return { storyboard, changedShots: 0, applied: [] };
  }

  const applied = [];
  let shots = storyboard.shots.map((s) => ({ ...s, visualIntent: { ...s.visualIntent } }));

  for (const action of actions) {
    if (action.type === 'rerender') {
      applied.push(action);
      continue;
    }

    shots = shots.map((shot, idx) => {
      const vi = shot.visualIntent || {};
      let next = { ...vi };

      if (action.type === 'brighten_palette') {
        const mood = vi.mood || 'curious';
        const bright = BRIGHT_PALETTES[mood] || BRIGHT_PALETTES.curious;
        next.palette = { ...bright };
        next.mood = mood;
        applied.push({ ...action, shotId: shot.id });
      }

      if (action.type === 'boost_motif') {
        const pick = ACTIVE_MOTIFS[(idx + attempt) % ACTIVE_MOTIFS.length];
        next.motif = pick;
        next.transition = attempt >= 2 ? 'zoom-punch' : vi.transition || 'rise-blur';
        applied.push({ ...action, shotId: shot.id, motif: pick });
      }

      if (action.type === 'ensure_fx') {
        const want = action.payload?.fx || ['glow', 'parallax', 'vignette'];
        next.fx = [...new Set([...(vi.fx || []), ...want])];
        applied.push({ ...action, shotId: shot.id });
      }

      if (action.type === 'boost_motion') {
        const pick = ACTIVE_MOTIONS[(idx + attempt) % ACTIVE_MOTIONS.length];
        next.motion = pick;
        applied.push({ ...action, shotId: shot.id, motion: pick });
      }

      if (action.type === 'unfreeze_camera') {
        const pick = ACTIVE_CAMERAS[(idx + attempt) % ACTIVE_CAMERAS.length];
        const cam = { ...(vi.camera || {}) };
        cam.move = pick;
        cam.intensity = Math.min(1, Math.max(0.55, (cam.intensity || 0.5) + 0.15 * attempt));
        cam.ease = 'ease-in-out';
        next.camera = cam;
        applied.push({ ...action, shotId: shot.id, cameraMove: pick });
      }

      next = normalizeVisualIntent(next, vi);
      next.planner = vi.planner || 'heuristic';
      next.repaired = true;
      next.repairAttempt = attempt;
      return { ...shot, visualIntent: next };
    });
  }

  // Deduplicate applied log by type+shotId
  const key = (a) => `${a.type}:${a.shotId || ''}`;
  const uniqApplied = [];
  const seen = new Set();
  for (const a of applied) {
    const k = key(a);
    if (seen.has(k)) continue;
    seen.add(k);
    uniqApplied.push(a);
  }

  const nextSb = {
    ...storyboard,
    version: storyboard.version || '6.0',
    phase: Math.max(8, storyboard.phase || 0),
    repaired: true,
    repairAttempt: attempt,
    shots,
    summary: {
      ...(storyboard.summary || {}),
      shotCount: shots.length,
      moods: [...new Set(shots.map((s) => s.visualIntent.mood))],
      motifs: [...new Set(shots.map((s) => s.visualIntent.motif))],
      cameraMoves: [...new Set(shots.map((s) => s.visualIntent.camera?.move).filter(Boolean))],
      repaired: true,
      repairAttempt: attempt
    }
  };

  return {
    storyboard: nextSb,
    changedShots: shots.length,
    applied: uniqApplied
  };
}

/** Ensure palette helper available for tests without pulling unused warning. */
export function fallbackPalette(mood) {
  return BRIGHT_PALETTES[mood] || paletteFor(mood);
}
