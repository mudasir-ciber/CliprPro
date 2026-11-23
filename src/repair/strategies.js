/**
 * Phase 8 repair strategies — map QC issue codes → deterministic patch ops.
 */

/** Brighter fallback palettes when frames go near-black. */
export const BRIGHT_PALETTES = Object.freeze({
  curious: { bg0: '#152238', bg1: '#243a66', accent: '#8ec5ff', text: '#ffffff', muted: '#c5dcff' },
  calm: { bg0: '#14352c', bg1: '#1f5344', accent: '#7aefc8', text: '#f2fffb', muted: '#b6f0dc' },
  intense: { bg0: '#2a1218', bg1: '#4a1c2a', accent: '#ff7a92', text: '#ffffff', muted: '#ffc2ce' },
  triumphant: { bg0: '#2a220f', bg1: '#4a3c18', accent: '#ffd56a', text: '#fff8e8', muted: '#ffe9b8' },
  reflective: { bg0: '#1a1f35', bg1: '#2c3558', accent: '#c4b5fd', text: '#f5f3ff', muted: '#ddd6fe' },
  urgent: { bg0: '#2c1708', bg1: '#4a2a10', accent: '#ff9d55', text: '#fff4ec', muted: '#ffd0a8' }
});

export const ACTIVE_MOTIFS = ['aurora', 'rings', 'bars', 'waveform', 'ribbons'];
export const ACTIVE_MOTIONS = ['orbit', 'pulse', 'impact', 'sweep'];
export const ACTIVE_CAMERAS = ['dolly-in', 'push-slide', 'orbit-right', 'crane-up'];

/**
 * @typedef {{type:string, shotIds?:string[]|null, payload?:object, reason:string}} RepairAction
 */

/**
 * Build repair actions from a QC report.
 * @returns {{actions: RepairAction[], needsRerender: boolean, needsStoryboardPatch: boolean}}
 */
export function strategiesFromQc(qc, { attempt = 1 } = {}) {
  const issues = qc?.issues || [];
  const actionable = issues.filter((i) => i.severity === 'error' || i.severity === 'warning');
  const actions = [];
  const codes = new Set(actionable.map((i) => i.code));

  if (codes.has('MISSING_FRAMES') || codes.has('TINY_FRAMES') || codes.has('DECODE_FAILED') || codes.has('PROBE_FAILED')) {
    actions.push({
      type: 'rerender',
      reason: 'Frame integrity failure — clear frames and re-render',
      payload: { clearFrames: true }
    });
  }

  if (codes.has('RESOLUTION_MISMATCH')) {
    actions.push({
      type: 'rerender',
      reason: 'Resolution mismatch — regenerate scene and re-render',
      payload: { regenerateScene: true, clearFrames: true }
    });
  }

  if (codes.has('BLACK_FRAMES') || codes.has('SHOT_COVERAGE')) {
    actions.push({
      type: 'brighten_palette',
      reason: 'Near-black / bad shot coverage — lift background + accent',
      payload: { strength: attempt }
    });
    actions.push({
      type: 'boost_motif',
      reason: 'Increase visible motif energy',
      payload: { motifs: ACTIVE_MOTIFS, attempt }
    });
    actions.push({
      type: 'ensure_fx',
      reason: 'Ensure glow/parallax so frames are not empty',
      payload: { fx: ['glow', 'parallax', 'vignette'] }
    });
  }

  if (codes.has('LOW_VARIANCE')) {
    actions.push({
      type: 'boost_motion',
      reason: 'Flat frames — more motion + active motif',
      payload: { motions: ACTIVE_MOTIONS, attempt }
    });
    actions.push({
      type: 'boost_motif',
      reason: 'Swap to higher-contrast motif',
      payload: { motifs: ACTIVE_MOTIFS, attempt }
    });
  }

  if (codes.has('FROZEN_STREAK')) {
    actions.push({
      type: 'unfreeze_camera',
      reason: 'Frozen streak — diversify camera moves + intensity',
      payload: { cameras: ACTIVE_CAMERAS, attempt }
    });
    actions.push({
      type: 'boost_motion',
      reason: 'Break freeze with motion change',
      payload: { motions: ACTIVE_MOTIONS, attempt }
    });
  }

  // Deduplicate by type
  const seen = new Set();
  const unique = [];
  for (const a of actions) {
    if (seen.has(a.type)) continue;
    seen.add(a.type);
    unique.push(a);
  }

  const needsStoryboardPatch = unique.some((a) => a.type !== 'rerender');
  const needsRerender = unique.length > 0;
  return { actions: unique, needsRerender, needsStoryboardPatch };
}
