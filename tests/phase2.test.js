/**
 * Phase 2 unit + integration tests.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { parseScript } from '../src/analysis/scriptParser.js';
import { splitSentences, tokenSimilarity, normalizeText } from '../src/analysis/normalize.js';
import { alignScriptToTranscript } from '../src/analysis/alignment.js';
import { detectPauses, classifyPauseDuration } from '../src/analysis/pauses.js';
import { segmentNarrative } from '../src/analysis/narrative.js';
import { scoreImportance } from '../src/analysis/importance.js';
import { buildTimeline } from '../src/timeline/engine.js';
import { validateTimeline } from '../src/timeline/validate.js';
import { parseSilenceDetect } from '../src/analysis/audioAnalysis.js';
import { transcribeEstimated } from '../src/analysis/transcription/estimated.js';
import { analyzeVideo } from '../src/pipeline/analyzeVideo.js';
import { hasFfmpeg, skipUnless, tmpDir, makeAudio, config } from './helpers.js';

test('splitSentences: periods, questions, abbreviations, decimals', () => {
  const parts = splitSentences('Dr. Smith paid $4.50. Did it work? Yes!');
  assert.equal(parts.length, 3);
  assert.match(parts[0], /Dr\. Smith/);
  assert.match(parts[1], /Did it work/);
});

test('parseScript: headings, sentences, stable IDs', () => {
  const doc = parseScript('# Title\n\nHello world. Second sentence!\n\n## Part Two\n\nThird one.');
  assert.ok(doc.sentences.length >= 3);
  assert.equal(doc.sentences[0].id, 'S001');
  assert.equal(doc.sentences[1].id, 'S002');
  assert.ok(doc.headings.length >= 1);
  assert.equal(doc.sentences[0].wordCount > 0, true);
});

test('tokenSimilarity and normalizeText', () => {
  assert.ok(tokenSimilarity('The Story Begins', 'the story begins') > 0.9);
  assert.equal(normalizeText('Hello, WORLD!'), 'hello world');
});

test('alignScriptToTranscript: identity mapping for estimated transcript', async () => {
  const script = parseScript('Alpha one. Beta two. Gamma three.');
  const audio = {
    durationSec: 9,
    speech: { regions: [{ start: 0, end: 9, duration: 9 }] },
    silence: { regions: [] }
  };
  const transcript = await transcribeEstimated({ script, audio });
  const alignment = alignScriptToTranscript({
    sentences: script.sentences,
    segments: transcript.segments,
    threshold: 0.45
  });
  assert.equal(alignment.stats.aligned, 3);
  assert.equal(alignment.alignments[0].start, 0);
  assert.ok(alignment.alignments[2].end <= 9.01);
});

test('pause classification + detection', () => {
  assert.equal(classifyPauseDuration(0.2), 'short-pause');
  assert.equal(classifyPauseDuration(0.7), 'medium-pause');
  assert.equal(classifyPauseDuration(1.5), 'long-pause');

  const pauses = detectPauses({
    audio: { silence: { regions: [{ start: 2, end: 3.5, duration: 1.5 }] } },
    alignment: {
      alignments: [
        { sentenceId: 'S001', start: 0, end: 2 },
        { sentenceId: 'S002', start: 3.5, end: 5 }
      ]
    },
    durationSec: 5
  });
  assert.ok(pauses.pauses.length >= 1);
  assert.ok(pauses.pauses.some((p) => p.type === 'long-pause'));
});

test('narrative segmentation + hook window', () => {
  const script = parseScript(
    'What if this is the hook?\nWe set the context carefully.\nThe story develops with details.\nSuddenly the reveal arrives.\nIn the end it worked.\nRemember this takeaway.'
  );
  const alignment = {
    alignments: script.sentences.map((s, i) => ({
      sentenceId: s.id,
      start: i * 5,
      end: (i + 1) * 5,
      status: 'aligned'
    }))
  };
  const narrative = segmentNarrative({
    sentences: script.sentences,
    alignment,
    durationSec: 30,
    hookWindowSec: 15
  });
  assert.ok(narrative.segments.length >= 2);
  assert.equal(narrative.hook.present, true);
  assert.ok(narrative.segments.some((s) => s.type === 'hook'));
});

test('importance scoring is deterministic and bounded', () => {
  const script = parseScript('What if fortunes change?\nUm basically filler text here.\nFinally the breakthrough arrived in 2024.');
  const alignment = {
    alignments: script.sentences.map((s, i) => ({
      sentenceId: s.id,
      start: i * 3,
      end: (i + 1) * 3,
      status: 'aligned'
    }))
  };
  const narrative = segmentNarrative({ sentences: script.sentences, alignment, durationSec: 9 });
  const a = scoreImportance({ sentences: script.sentences, alignment, narrative, pauses: { pauses: [] }, durationSec: 9 });
  const b = scoreImportance({ sentences: script.sentences, alignment, narrative, pauses: { pauses: [] }, durationSec: 9 });
  assert.deepEqual(a.scores, b.scores);
  for (const s of a.scores) {
    assert.ok(s.importance >= 0 && s.importance <= 1);
    assert.ok(s.factors);
  }
});

test('timeline engine + validation', async () => {
  const script = parseScript('One. Two. Three.');
  const audio = {
    durationSec: 6,
    format: 'mp3',
    codec: 'mp3',
    speech: { regions: [{ start: 0, end: 6, duration: 6 }] },
    silence: { regions: [] }
  };
  const transcript = await transcribeEstimated({ script, audio });
  const alignment = alignScriptToTranscript({ sentences: script.sentences, segments: transcript.segments });
  const pauses = detectPauses({ audio, alignment, durationSec: 6 });
  const narrative = segmentNarrative({ sentences: script.sentences, alignment, durationSec: 6 });
  const importance = scoreImportance({ sentences: script.sentences, alignment, narrative, pauses, durationSec: 6 });
  const timeline = buildTimeline({
    jobId: 'job-test',
    audio,
    script,
    alignment,
    narrative,
    importance,
    pauses
  });
  assert.equal(timeline.version, '2.0');
  assert.equal(timeline.audio.masterClock, true);
  assert.equal(timeline.scenes.length, 3);
  assert.equal(timeline.validation.valid, true);
  assert.equal(timeline.scenes[0].visualIntent.type, 'placeholder');

  const bad = structuredClone(timeline);
  bad.scenes[0].end = -1;
  const v = validateTimeline(bad);
  assert.equal(v.valid, false);
});

test('parseSilenceDetect parses ffmpeg stderr', () => {
  const stderr = `
silence_start: 1.0
silence_end: 2.5 | silence_duration: 1.5
silence_start: 4.0
silence_end: 4.8 | silence_duration: 0.8
`;
  const regions = parseSilenceDetect(stderr);
  assert.equal(regions.length, 2);
  assert.equal(regions[0].duration, 1.5);
});

test('analyzeVideo integration writes artifacts', async (t) => {
  const reason = skipUnless(hasFfmpeg, 'FFmpeg');
  if (reason) return t.skip(reason);

  const dir = tmpDir('clipr-p2-');
  const scriptPath = path.join(dir, 'script.txt');
  const audioPath = path.join(dir, 'voiceover.wav');
  fs.writeFileSync(
    scriptPath,
    'What if timing mattered?\nThe system maps every sentence.\nFinally we build a timeline.\nRemember the takeaway.'
  );
  await makeAudio(audioPath, { durationSec: 4 });

  const result = await analyzeVideo({
    scriptPath,
    audioPath,
    jobsDir: path.join(dir, 'jobs'),
    force: true,
    skipDepsCheck: false
  });

  assert.ok(result.timeline.validation.valid);
  assert.ok(fs.existsSync(result.paths.timeline));
  assert.ok(fs.existsSync(result.paths.script));
  assert.ok(fs.existsSync(result.paths.alignment));
  assert.ok(result.script.sentences.length >= 3);
  assert.ok(result.timeline.scenes.length >= 3);
});
