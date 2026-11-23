/**
 * Phase 8 repair planner — decide whether / how to repair from QC.
 */
import { strategiesFromQc } from './strategies.js';
import { applyRepairActions } from './apply.js';

/**
 * @param {object} qc QC report
 * @param {object|null} storyboard
 * @param {{attempt:number, repairOnWarnings?:boolean, qcStrict?:boolean}} opts
 */
export function planRepair(qc, storyboard, opts = {}) {
  const attempt = opts.attempt || 1;
  const repairOnWarnings = opts.repairOnWarnings === true || opts.qcStrict === true;

  if (!qc || qc.passed) {
    return { needed: false, actions: [], storyboard, reason: 'qc_passed' };
  }

  const issues = (qc.issues || []).filter((i) => {
    if (i.severity === 'error') return true;
    return repairOnWarnings && i.severity === 'warning';
  });
  if (!issues.length) {
    return { needed: false, actions: [], storyboard, reason: 'no_actionable_issues' };
  }

  const filteredQc = { ...qc, issues };
  const strat = strategiesFromQc(filteredQc, { attempt });
  if (!strat.actions.length) {
    return { needed: false, actions: [], storyboard, reason: 'no_strategy' };
  }

  let nextSb = storyboard;
  let applied = [];
  let changedShots = 0;
  if (strat.needsStoryboardPatch && storyboard) {
    const result = applyRepairActions(storyboard, strat.actions, { attempt });
    nextSb = result.storyboard;
    applied = result.applied;
    changedShots = result.changedShots;
  }

  return {
    needed: true,
    actions: strat.actions,
    applied,
    changedShots,
    storyboard: nextSb,
    needsRerender: strat.needsRerender,
    needsStoryboardPatch: strat.needsStoryboardPatch,
    reason: strat.actions.map((a) => a.type).join(',')
  };
}
