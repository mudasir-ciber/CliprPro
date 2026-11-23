#!/usr/bin/env node
/**
 * Debug a job or re-run analysis with --debug dumps.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { analyzeVideo } from '../src/pipeline/analyzeVideo.js';
import { resolveInputDir } from '../src/pipeline/validateInputs.js';
import { fail, printRel } from './cli-shared.js';

const USAGE = `Usage:
  npm run debug -- --job jobs/<job-id>
  npm run debug -- --script <s> --audio <a>
  npm run debug -- --input <folder>`;

let values;
try {
  ({ values } = parseArgs({
    options: {
      job: { type: 'string' },
      script: { type: 'string' },
      audio: { type: 'string' },
      input: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false }
    }
  }));
} catch (err) {
  console.error(`ERROR: ${err.message}`);
  process.exit(2);
}

if (values.help) {
  console.log(USAGE);
  process.exit(0);
}

try {
  if (values.job) {
    const jobDir = path.resolve(values.job);
    const analysisDir = path.join(jobDir, 'analysis');
    const files = ['script.json', 'audio.json', 'transcript.json', 'alignment.json', 'pauses.json', 'narrative.json', 'importance.json', 'timeline.json'];
    for (const f of files) {
      const p = path.join(analysisDir, f);
      console.log(`\n===== ${f} (${fs.existsSync(p) ? 'OK' : 'MISSING'}) =====`);
      if (fs.existsSync(p)) {
        const data = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (f === 'script.json') console.log(data.sentences?.map((s) => `${s.id}: ${s.text}`).join('\n'));
        else if (f === 'alignment.json') console.log(JSON.stringify(data.alignments, null, 2));
        else if (f === 'timeline.json') {
          console.log(JSON.stringify({
            audio: data.audio,
            segments: data.segments,
            scenes: data.scenes,
            pauses: data.pauses,
            validation: data.validation
          }, null, 2));
        } else console.log(JSON.stringify(data, null, 2).slice(0, 4000));
      }
    }
    const meta = path.join(jobDir, 'metadata.json');
    if (fs.existsSync(meta)) {
      console.log('\n===== metadata.json =====');
      console.log(fs.readFileSync(meta, 'utf8'));
    }
    const log = path.join(jobDir, 'logs', 'pipeline.log');
    if (fs.existsSync(log)) {
      console.log('\n===== pipeline.log (tail) =====');
      const lines = fs.readFileSync(log, 'utf8').trim().split(/\r?\n/);
      console.log(lines.slice(-40).join('\n'));
    }
    process.exit(0);
  }

  let scriptPath = values.script;
  let audioPath = values.audio;
  if (!scriptPath || !audioPath) {
    const found = resolveInputDir(values.input || 'input');
    scriptPath = scriptPath || found.scriptPath;
    audioPath = audioPath || found.audioPath;
  }
  if (!scriptPath || !audioPath) {
    console.error(USAGE);
    process.exit(2);
  }

  const result = await analyzeVideo({
    scriptPath,
    audioPath,
    force: true,
    debug: true
  });
  console.log(`\nDebug analysis written to ${printRel(result.paths.analysisDir)}`);
} catch (err) {
  fail(err);
}
