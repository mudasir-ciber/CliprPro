/**
 * Phase 8 self-repair tests.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { strategiesFromQc } from '../src/repair/strategies.js';
import { applyRepairActions } from '../src/repair/apply.js';
import { planRepair } from '../src/repair/plan.js';
import { normalizeVisualIntent } from '../src/storyboard/schema.js';

function fakeShot(id, cameraMove = 'static') {
  return {
    id,
    sceneId: id.replace('SHOT-', 'SC'),
    start: 0,
    end: 1,
    duration: 1,
    visualIntent: normalizeVisualIntent({
      mood: 'curious',
      motif: 'geometric',
      motion: 'fade',
      camera: { move: cameraMove, intensity: 0.3, zoom: 1 },
      fx: ['vignette'],
      palette: { bg0: '#010101', bg1: '#020202', accent: '#111111', text: '#ffffff', muted: '#222222' }
    })
  };
}

test('strategiesFromQc maps black frames to brighten + motif', () => {
  const { actions, needsStoryboardPatch } = strategiesFromQc({
    issues: [{ code: 'BLACK_FRAMES', severity: 'error', message: 'black' }]
  });
  assert.ok(actions.some((a) => a.type === 'brighten_palette'));
  assert.ok(actions.some((a) => a.type === 'boost_motif'));
  assert.equal(needsStoryboardPatch, true);
});

test('strategiesFromQc maps missing frames to rerender only', () => {
  const { actions, needsStoryboardPatch } = strategiesFromQc({
    issues: [{ code: 'MISSING_FRAMES', severity: 'error', message: 'missing' }]
  });
  assert.deepEqual(
    actions.map((a) => a.type),
    ['rerender']
  );
  assert.equal(needsStoryboardPatch, false);
});

test('applyRepairActions brightens palette and marks repaired', () => {
  const sb = {
    version: '6.0',
    planner: 'heuristic',
    shots: [fakeShot('SHOT-1'), fakeShot('SHOT-2')]
  };
  const { storyboard, changedShots } = applyRepairActions(
    sb,
    [
      { type: 'brighten_palette', reason: 'test' },
      { type: 'boost_motif', reason: 'test' },
      { type: 'ensure_fx', reason: 'test', payload: { fx: ['glow', 'parallax'] } }
    ],
    { attempt: 1 }
  );
  assert.equal(changedShots, 2);
  assert.equal(storyboard.repaired, true);
  assert.ok(storyboard.shots[0].visualIntent.palette.bg0 !== '#010101');
  assert.ok(storyboard.shots[0].visualIntent.fx.includes('glow'));
  assert.ok(['aurora', 'rings', 'bars', 'waveform', 'ribbons'].includes(storyboard.shots[0].visualIntent.motif));
});

test('planRepair no-ops when QC passed', () => {
  const plan = planRepair({ passed: true, issues: [] }, { shots: [fakeShot('SHOT-1')] }, { attempt: 1 });
  assert.equal(plan.needed, false);
});

test('planRepair produces patched storyboard for black QC', () => {
  const sb = { version: '6.0', shots: [fakeShot('SHOT-1')] };
  const plan = planRepair(
    {
      passed: false,
      issues: [{ code: 'BLACK_FRAMES', severity: 'error', message: 'black' }]
    },
    sb,
    { attempt: 1 }
  );
  assert.equal(plan.needed, true);
  assert.equal(plan.storyboard.repaired, true);
  assert.ok(plan.actions.length >= 1);
});

test('planRepair ignores warnings unless repairOnWarnings', () => {
  const sb = { version: '6.0', shots: [fakeShot('SHOT-1')] };
  const soft = planRepair(
    { passed: false, issues: [{ code: 'BLACK_FRAMES', severity: 'warning', message: 'warn' }] },
    sb,
    { attempt: 1, repairOnWarnings: false }
  );
  assert.equal(soft.needed, false);

  const hard = planRepair(
    { passed: false, issues: [{ code: 'BLACK_FRAMES', severity: 'warning', message: 'warn' }] },
    sb,
    { attempt: 1, repairOnWarnings: true }
  );
  assert.equal(hard.needed, true);
});

test('unfreeze camera diversifies moves', () => {
  const sb = {
    version: '6.0',
    shots: [fakeShot('SHOT-1', 'static'), fakeShot('SHOT-2', 'static')]
  };
  const { storyboard } = applyRepairActions(
    sb,
    [{ type: 'unfreeze_camera', reason: 'freeze' }],
    { attempt: 1 }
  );
  assert.notEqual(storyboard.shots[0].visualIntent.camera.move, 'static');
  assert.ok(storyboard.shots[0].visualIntent.camera.intensity >= 0.55);
});
