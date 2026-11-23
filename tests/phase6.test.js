/**
 * Phase 6 cinematic camera tests.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { CAMERA_MOVES, CAMERA_EASES, ROLE_CAMERA } from '../src/cinematic/presets.js';
import { evaluateCamera, easeCamera, normalizeCamera } from '../src/cinematic/evaluate.js';
import { normalizeVisualIntent } from '../src/storyboard/schema.js';
import { planStoryboardHeuristic } from '../src/storyboard/heuristic.js';
import { parseScript } from '../src/analysis/scriptParser.js';
import { buildTimeline } from '../src/timeline/engine.js';
import { alignScriptToTranscript } from '../src/analysis/alignment.js';
import { detectPauses } from '../src/analysis/pauses.js';
import { segmentNarrative } from '../src/analysis/narrative.js';
import { scoreImportance } from '../src/analysis/importance.js';
import { transcribeEstimated } from '../src/analysis/transcription/estimated.js';

test('camera presets cover cinematic moves', () => {
  assert.ok(CAMERA_MOVES.includes('dolly-in'));
  assert.ok(CAMERA_MOVES.includes('handheld'));
  assert.ok(CAMERA_EASES.includes('ease-in-out'));
  assert.equal(ROLE_CAMERA.hook.move, 'dolly-in');
  assert.equal(ROLE_CAMERA.climax.move, 'dolly-in');
});

test('easeCamera is deterministic and bounded', () => {
  assert.equal(easeCamera(0, 'linear'), 0);
  assert.equal(easeCamera(1, 'linear'), 1);
  const mid = easeCamera(0.5, 'ease-in-out');
  assert.ok(mid > 0.4 && mid < 0.6);
  assert.equal(easeCamera(0.5, 'ease-in-out'), easeCamera(0.5, 'ease-in-out'));
});

test('evaluateCamera dolly-in increases zoom over progress', () => {
  const a = evaluateCamera({ move: 'dolly-in', intensity: 1, zoom: 1 }, 0, 0);
  const b = evaluateCamera({ move: 'dolly-in', intensity: 1, zoom: 1 }, 1, 0);
  assert.ok(b.zoom > a.zoom);
  assert.ok(b.fov < a.fov);
});

test('evaluateCamera handheld is time-driven but deterministic', () => {
  const a = evaluateCamera({ move: 'handheld', intensity: 0.8 }, 0.5, 1.25);
  const b = evaluateCamera({ move: 'handheld', intensity: 0.8 }, 0.5, 1.25);
  assert.deepEqual(a, b);
  assert.notEqual(a.panX, 0);
});

test('evaluateCamera from/to keyframes interpolate', () => {
  const cam = evaluateCamera(
    { from: { zoom: 1, panX: 0 }, to: { zoom: 1.5, panX: 0.1 }, ease: 'linear' },
    0.5,
    0
  );
  assert.equal(cam.zoom, 1.25);
  assert.equal(cam.panX, 0.05);
});

test('normalizeCamera clamps invalid move', () => {
  const cam = normalizeCamera({ move: 'warp-drive', intensity: 0.9 }, { move: 'static' });
  assert.equal(cam.move, 'static');
  assert.equal(cam.intensity, 0.9);
});

test('normalizeVisualIntent includes Phase 6 camera contract', () => {
  const intent = normalizeVisualIntent({
    mood: 'intense',
    camera: { move: 'orbit-left', ease: 'ease-out', intensity: 0.7, fov: 40 }
  });
  assert.equal(intent.version, '6.0');
  assert.equal(intent.camera.move, 'orbit-left');
  assert.equal(intent.camera.ease, 'ease-out');
  assert.equal(intent.camera.fov, 40);
});

test('heuristic assigns role cameras and summary.cameraMoves', async () => {
  const script = parseScript('What if this hooks you?\nSuddenly the climax hits hard.\nRemember the takeaway.');
  const audio = {
    durationSec: 6,
    format: 'wav',
    codec: 'pcm_s16le',
    speech: { regions: [{ start: 0, end: 6, duration: 6 }] },
    silence: { regions: [] }
  };
  const transcript = await transcribeEstimated({ script, audio });
  const alignment = alignScriptToTranscript({ sentences: script.sentences, segments: transcript.segments });
  const pauses = detectPauses({ audio, alignment, durationSec: 6 });
  const narrative = segmentNarrative({ sentences: script.sentences, alignment, durationSec: 6 });
  const importance = scoreImportance({ sentences: script.sentences, alignment, narrative, pauses, durationSec: 6 });
  const timeline = buildTimeline({ jobId: 'p6', audio, script, alignment, narrative, importance, pauses });
  const sb = planStoryboardHeuristic({ timeline, script });
  assert.equal(sb.version, '6.0');
  assert.equal(sb.phase, 6);
  assert.ok(sb.summary.cameraMoves.length >= 1);
  assert.ok(sb.shots.every((s) => CAMERA_MOVES.includes(s.visualIntent.camera.move)));
  assert.ok(sb.shots.every((s) => Number.isFinite(s.visualIntent.camera.intensity)));
});

test('storyboard + threejs scenes embed evalCamera', () => {
  for (const rel of [
    path.join('src', 'scenes', 'storyboard', 'scene.template.html'),
    path.join('src', 'scenes', 'threejs', 'scene.template.html')
  ]) {
    const src = fs.readFileSync(rel, 'utf8');
    assert.ok(src.includes('evalCamera'), `${rel} missing evalCamera`);
    assert.ok(src.includes('dolly-in'), `${rel} missing dolly-in`);
    assert.ok(src.includes('phase: 6'), `${rel} missing phase 6`);
    for (const bad of ['Date.now', 'Math.random', 'requestAnimationFrame', 'performance.now', 'setTimeout', 'setInterval']) {
      assert.ok(!src.includes(bad), `${rel} must not use ${bad}`);
    }
  }
});
