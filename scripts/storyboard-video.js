#!/usr/bin/env node
/**
 * Phase 3: plan storyboard for an analyzed job (or analyze+plan from inputs).
 */
import { analyzeVideo } from '../src/pipeline/analyzeVideo.js';
import { planStoryboardForJob } from '../src/pipeline/planStoryboard.js';
import { parseCli, resolvePaths, fail, printRel } from './cli-shared.js';

const USAGE = `Usage:
  npm run storyboard -- --job jobs/<job-id> [--planner heuristic|llm|auto]
  npm run storyboard -- --input input [--planner heuristic]

Options:
  --planner heuristic|llm|auto   Default: heuristic
  --storyboard <file.json>       Apply an existing storyboard file
  --recompute                    Re-run analysis before planning (with --input)
  -h, --help`;

const values = parseCli({
  job: { type: 'string' },
  planner: { type: 'string' },
  storyboard: { type: 'string' },
  scene: { type: 'string' }
});

if (values.help) {
  console.log(USAGE);
  process.exit(0);
}

try {
  let jobDir = values.job || null;

  if (!jobDir) {
    const { scriptPath, audioPath } = resolvePaths(values);
    if (!scriptPath || !audioPath) {
      console.error(USAGE);
      process.exit(2);
    }
    const analysis = await analyzeVideo({
      scriptPath,
      audioPath,
      jobsDir: values['jobs-dir'],
      force: values.force || values.recompute,
      debug: values.debug,
      transcriptionEngine: values.engine
    });
    jobDir = analysis.job.dir;
  }

  const result = await planStoryboardForJob({
    jobDir,
    planner: values.planner,
    storyboardPath: values.storyboard,
    storyboardPlanner: values.planner
  });

  console.log(`
STORYBOARD COMPLETE

Job ID: ${result.jobId}
Planner: ${result.storyboard.planner}
Shots: ${result.storyboard.shots.length}
Moods: ${(result.storyboard.summary?.moods || []).join(', ')}

Storyboard:
${printRel(result.paths.storyboard)}

Timeline (updated):
${printRel(result.paths.timeline)}
`);
} catch (err) {
  fail(err);
}
