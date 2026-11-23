/**
 * Apply storyboard shots onto timeline.scenes[].visualIntent and render hints.
 */
import { validateStoryboard } from './schema.js';
import { validateTimeline } from '../timeline/validate.js';

/**
 * @param {object} timeline
 * @param {object} storyboard
 * @returns {{ timeline: object, storyboard: object }}
 */
export function applyStoryboardToTimeline(timeline, storyboard) {
  const sbCheck = validateStoryboard(storyboard);
  if (!sbCheck.valid) {
    const msg = sbCheck.errors.map((e) => e.message).join('; ');
    const err = new Error(`Invalid storyboard: ${msg}`);
    err.code = 'STORYBOARD_INVALID';
    err.validation = sbCheck;
    throw err;
  }

  const byScene = new Map(storyboard.shots.map((s) => [s.sceneId, s]));
  const scenes = (timeline.scenes || []).map((sc) => {
    const shot = byScene.get(sc.id);
    if (!shot) return sc;
    return {
      ...sc,
      visualIntent: shot.visualIntent,
      render: {
        renderer: 'html-canvas',
        sceneModule: 'storyboard',
        shotId: shot.id
      }
    };
  });

  const next = {
    ...timeline,
    version: timeline.version || '2.0',
    scenes,
    storyboard: {
      version: storyboard.version,
      planner: storyboard.planner,
      shotCount: storyboard.shots.length,
      appliedAt: new Date().toISOString()
    }
  };
  next.validation = validateTimeline(next);
  return { timeline: next, storyboard, storyboardValidation: sbCheck };
}
