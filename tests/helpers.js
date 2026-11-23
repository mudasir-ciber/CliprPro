/** Shared test helpers (not a test file). */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getConfig } from '../src/config.js';
import { run } from '../src/utils/exec.js';
import { checkFfmpeg, checkFfprobe, checkBrowser } from '../src/pipeline/checkDependencies.js';

export const config = getConfig();

async function ok(fn) {
  try {
    await fn();
    return true;
  } catch {
    return false;
  }
}

export const hasFfmpeg = (await ok(() => checkFfmpeg(config))) && (await ok(() => checkFfprobe(config)));
export const hasBrowser = await ok(() => checkBrowser());

/**
 * Tests that need external tools are SKIPPED when the tools are missing (so unit tests still run),
 * unless REQUIRE_E2E=1 is set - then they fail instead.
 */
export function skipUnless(available, what) {
  if (available || process.env.REQUIRE_E2E === '1') return false;
  return `${what} not available`;
}

export function tmpDir(prefix = 'ocvg-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Generate a test tone with ffmpeg. */
export async function makeAudio(file, { durationSec = 2, sampleRate = 44100, channels = 2 } = {}) {
  const codecArgs = file.endsWith('.mp3') ? ['-c:a', 'libmp3lame'] : file.endsWith('.m4a') || file.endsWith('.aac') ? ['-c:a', 'aac'] : [];
  const r = await run(config.ffmpegPath, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', `sine=frequency=440:duration=${durationSec}`,
    '-ar', String(sampleRate), '-ac', String(channels), ...codecArgs, file
  ]);
  if (r.code !== 0) throw new Error(`makeAudio failed: ${r.stderr}`);
  return file;
}
