/**
 * Phase 3 storyboard planning entrypoint.
 */
import { planStoryboardHeuristic } from './heuristic.js';
import { planStoryboardLlm } from './llm.js';
import { applyStoryboardToTimeline } from './apply.js';
import { validateStoryboard } from './schema.js';
import { VideoGenError, ErrorCodes } from '../utils/errors.js';

export { planStoryboardHeuristic, planStoryboardLlm, applyStoryboardToTimeline, validateStoryboard };

/**
 * @param {object} opts
 * @param {object} opts.timeline
 * @param {object} opts.script
 * @param {object} opts.config
 * @param {'heuristic'|'llm'|'auto'} [opts.planner]
 */
export async function planStoryboard(opts) {
  const planner = (opts.planner || opts.config?.storyboardPlanner || 'heuristic').toLowerCase();

  if (planner === 'heuristic') {
    return planStoryboardHeuristic({ timeline: opts.timeline, script: opts.script });
  }

  if (planner === 'llm') {
    return planStoryboardLlm({ timeline: opts.timeline, script: opts.script, config: opts.config || {} });
  }

  if (planner === 'auto') {
    try {
      return await planStoryboardLlm({ timeline: opts.timeline, script: opts.script, config: opts.config || {} });
    } catch (err) {
      if (err instanceof VideoGenError && err.code === ErrorCodes.STORYBOARD_UNAVAILABLE) {
        return planStoryboardHeuristic({ timeline: opts.timeline, script: opts.script });
      }
      throw err;
    }
  }

  throw new VideoGenError(
    ErrorCodes.INVALID_CONFIG,
    `Unknown storyboard planner "${planner}". Use heuristic | llm | auto.`
  );
}
