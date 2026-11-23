#!/usr/bin/env node
/** Prints the status of every external dependency. Exit code 1 if something is missing. */
import { getConfig } from '../src/config.js';
import { checkFfmpeg, checkFfprobe, checkBrowser } from '../src/pipeline/checkDependencies.js';

const config = getConfig();
const checks = [
  ['FFmpeg', () => checkFfmpeg(config)],
  ['FFprobe', () => checkFfprobe(config)],
  ['Chromium (Playwright)', () => checkBrowser()]
];

let failed = false;
console.log(`Node.js ${process.version}`);
if (Number(process.versions.node.split('.')[0]) < 20) {
  console.log('[FAIL] Node.js 20 or newer is required.');
  failed = true;
}
for (const [name, fn] of checks) {
  try {
    console.log(`[ OK ] ${name}: ${await fn()}`);
  } catch (err) {
    failed = true;
    console.log(`[FAIL] ${name}: ${err.message}`);
  }
}
process.exit(failed ? 1 : 0);
