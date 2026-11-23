#!/usr/bin/env node
/** Validate an existing timeline.json */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { validateTimeline } from '../src/timeline/validate.js';

const USAGE = `Usage:
  npm run validate-timeline -- --file jobs/<job-id>/analysis/timeline.json`;

let values;
try {
  ({ values } = parseArgs({
    options: {
      file: { type: 'string', short: 'f' },
      help: { type: 'boolean', short: 'h', default: false }
    }
  }));
} catch (err) {
  console.error(`ERROR: ${err.message}`);
  process.exit(2);
}

if (values.help || !values.file) {
  console.log(USAGE);
  process.exit(values.help ? 0 : 2);
}

const abs = path.resolve(values.file);
if (!fs.existsSync(abs)) {
  console.error(`ERROR: File not found: ${abs}`);
  process.exit(1);
}

const timeline = JSON.parse(fs.readFileSync(abs, 'utf8'));
const result = validateTimeline(timeline);
console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 1);
