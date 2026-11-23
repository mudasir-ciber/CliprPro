/**
 * Verify FFmpeg, FFprobe, Playwright and Chromium BEFORE doing any work.
 */
import fs from 'node:fs';
import { run } from '../utils/exec.js';
import { VideoGenError, ErrorCodes } from '../utils/errors.js';
import { loadPlaywright } from '../renderer/playwright.js';

async function toolVersion(command, missingCode, label) {
  let result;
  try {
    result = await run(command, ['-version']);
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new VideoGenError(
        missingCode,
        `${label} not found.\nPlease install FFmpeg and add it to PATH (Windows: "winget install Gyan.FFmpeg", then reopen the terminal),\nor set ${label.toUpperCase()}_PATH in .env.`,
        { cause: err }
      );
    }
    throw err;
  }
  if (result.code !== 0) {
    throw new VideoGenError(missingCode, `${label} exists but failed to run.`, { details: result.stderr });
  }
  const first = result.stdout.split(/\r?\n/)[0] || '';
  return first.replace(/^\w+ version\s+/i, '').split(' ')[0];
}

export async function checkFfmpeg(config) {
  return toolVersion(config.ffmpegPath, ErrorCodes.FFMPEG_MISSING, 'FFmpeg');
}

export async function checkFfprobe(config) {
  return toolVersion(config.ffprobePath, ErrorCodes.FFPROBE_MISSING, 'FFprobe');
}

export async function checkBrowser() {
  const pw = await loadPlaywright();
  const exe = pw.chromium.executablePath();
  if (!exe || !fs.existsSync(exe)) {
    throw new VideoGenError(
      ErrorCodes.CHROMIUM_MISSING,
      'Chromium for Playwright is not installed.\nRun: npx playwright install chromium',
      { details: `Expected at: ${exe}` }
    );
  }
  return exe;
}

/** @returns {Promise<{ffmpeg:string, ffprobe:string, chromium:string}>} */
export async function checkDependencies(config) {
  const ffmpeg = await checkFfmpeg(config);
  const ffprobe = await checkFfprobe(config);
  const chromium = await checkBrowser();
  return { ffmpeg, ffprobe, chromium };
}
