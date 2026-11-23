#!/usr/bin/env node
/**
 * Phase 10 production doctor — deps + CliprPro version + phase status.
 */
import { getConfig } from '../src/config.js';
import { checkFfmpeg, checkFfprobe, checkBrowser } from '../src/pipeline/checkDependencies.js';
import { readPackageVersion, phaseStatusTable } from '../src/package/manifest.js';

const config = getConfig();
let failed = false;

console.log(`CliprPro ${readPackageVersion()} (production)`);
console.log(`Node.js ${process.version}`);
if (Number(process.versions.node.split('.')[0]) < 20) {
  console.log('[FAIL] Node.js 20 or newer is required.');
  failed = true;
}

const checks = [
  ['FFmpeg', () => checkFfmpeg(config)],
  ['FFprobe', () => checkFfprobe(config)],
  ['Chromium/Chrome', () => checkBrowser(config)]
];

for (const [name, fn] of checks) {
  try {
    console.log(`[ OK ] ${name}: ${await fn()}`);
  } catch (err) {
    failed = true;
    console.log(`[FAIL] ${name}: ${err.message}`);
  }
}

console.log('\nPhases:');
for (const p of phaseStatusTable()) {
  console.log(`  ${String(p.phase).padStart(2, ' ')}. ${p.name} — ${p.status}`);
}

console.log(failed ? '\nDoctor: NOT READY' : '\nDoctor: READY');
process.exit(failed ? 1 : 0);
