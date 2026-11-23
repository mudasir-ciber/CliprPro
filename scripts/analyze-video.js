#!/usr/bin/env node
/**
 * Phase 2 analysis only: script + voiceover -> timeline.json (+ analysis artifacts).
 */
import { analyzeVideo } from '../src/pipeline/analyzeVideo.js';
import { parseCli, resolvePaths, fail, printRel } from './cli-shared.js';

const USAGE = `Usage:
  npm run analyze -- --script <script.txt> --audio <voiceover.mp3> [options]
  npm run analyze -- --input <folder>

Options:
  --recompute      Recompute (ignore analysis cache)
  --force          Alias of --recompute (prefer --recompute with npm)
  --no-cache       Do not read/write analysis cache
  --debug          Print sentence/alignment/pause/timeline debug dumps
  --engine <name>  Transcription engine: estimated (default) | whisper
  --jobs-dir <dir>
  -h, --help`;

const values = parseCli();
if (values.help) {
  console.log(USAGE);
  process.exit(0);
}

const { scriptPath, audioPath } = resolvePaths(values);
if (!scriptPath || !audioPath) {
  console.error('ERROR: Provide --script and --audio, or --input folder with script.txt + voiceover.*');
  process.exit(2);
}

try {
  const result = await analyzeVideo({
    scriptPath,
    audioPath,
    jobsDir: values['jobs-dir'],
    force: values.force || values.recompute,
    noCache: values['no-cache'],
    debug: values.debug,
    transcriptionEngine: values.engine
  });

  console.log(`
ANALYSIS COMPLETE

Job ID: ${result.jobId || '(none)'}
Cache: ${result.cacheHit ? 'HIT' : 'MISS'} (${result.cacheKey})
Sentences: ${result.script.sentences.length}
Scenes: ${result.timeline.scenes.length}
Segments: ${result.timeline.segments.length}
Pauses: ${result.pauses.pauses.length}
Timeline valid: ${result.timeline.validation.valid}
Engine: ${result.transcript.engine}

Timeline:
${printRel(result.paths.timeline)}
`);
  if (!result.timeline.validation.valid) {
    console.error('Timeline validation errors:');
    for (const e of result.timeline.validation.errors) console.error(`  - ${e.code}: ${e.message}`);
    process.exit(1);
  }
} catch (err) {
  fail(err);
}
