/**
 * Centralized configuration for Phase 1 + Phase 2.
 * Priority: function overrides → process env → .env file → defaults.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VideoGenError, ErrorCodes } from './utils/errors.js';

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const SUPPORTED_AUDIO_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.aac'];

export const DEFAULTS = Object.freeze({
  fps: 30,
  width: 1920,
  height: 1080,
  sceneName: 'basic',
  jobsDirName: 'jobs',
  transcriptionEngine: 'estimated',
  transcriptionLanguage: 'en',
  hookWindowSec: 15,
  alignmentThreshold: 0.45,
  silenceNoiseDb: -30,
  minSilenceSec: 0.25,
  pauseShortMax: 0.4,
  pauseMediumMax: 1.0,
  pauseMinGap: 0.2
});

/** Minimal .env loader (no dependency). Does not override variables already set. */
function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv(path.join(PROJECT_ROOT, '.env'));

function envNumber(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Parse "1920x1080" -> { width, height }. */
export function parseResolution(text) {
  const m = /^(\d{2,5})\s*[xX]\s*(\d{2,5})$/.exec(String(text).trim());
  if (!m) {
    throw new VideoGenError(ErrorCodes.INVALID_CONFIG, `Invalid resolution "${text}". Use WIDTHxHEIGHT, for example 1920x1080.`);
  }
  return { width: Number(m[1]), height: Number(m[2]) };
}

/**
 * Build a validated config object.
 */
export function getConfig(overrides = {}) {
  let { width, height } = DEFAULTS;
  if (overrides.resolution) ({ width, height } = parseResolution(overrides.resolution));
  if (overrides.width) width = Number(overrides.width);
  if (overrides.height) height = Number(overrides.height);

  const fps = overrides.fps !== undefined ? Number(overrides.fps) : DEFAULTS.fps;
  if (!Number.isFinite(fps) || fps <= 0 || fps > 120) {
    throw new VideoGenError(ErrorCodes.INVALID_CONFIG, `Invalid FPS "${overrides.fps}". Use a number between 1 and 120.`);
  }
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 16 || height < 16 || width % 2 || height % 2) {
    throw new VideoGenError(
      ErrorCodes.INVALID_CONFIG,
      `Invalid resolution ${width}x${height}. Width and height must be even integers (H.264 yuv420p requirement).`
    );
  }

  const jobsDirRaw = overrides.jobsDir || process.env.JOBS_DIR || DEFAULTS.jobsDirName;
  const jobsDir = path.isAbsolute(jobsDirRaw) ? jobsDirRaw : path.resolve(process.cwd(), jobsDirRaw);

  const transcriptionEngine = (
    overrides.transcriptionEngine ||
    process.env.TRANSCRIPTION_ENGINE ||
    DEFAULTS.transcriptionEngine
  ).toLowerCase();

  return {
    fps,
    width,
    height,
    sceneName: overrides.sceneName || DEFAULTS.sceneName,
    jobsDir,
    keepFrames: overrides.keepFrames !== undefined ? Boolean(overrides.keepFrames) : true,
    ffmpegPath: overrides.ffmpegPath || process.env.FFMPEG_PATH || 'ffmpeg',
    ffprobePath: overrides.ffprobePath || process.env.FFPROBE_PATH || 'ffprobe',
    chromiumNoSandbox: process.env.CHROMIUM_NO_SANDBOX === '1',
    chromiumPath: overrides.chromiumPath || process.env.CHROMIUM_PATH || process.env.CHROME_PATH || null,
    debug: overrides.debug !== undefined ? Boolean(overrides.debug) : process.env.DEBUG === '1',
    transcriptionEngine,
    transcriptionLanguage:
      overrides.transcriptionLanguage || process.env.TRANSCRIPTION_LANGUAGE || DEFAULTS.transcriptionLanguage,
    hookWindowSec: overrides.hookWindowSec ?? envNumber('HOOK_WINDOW_SEC', DEFAULTS.hookWindowSec),
    alignmentThreshold: overrides.alignmentThreshold ?? envNumber('ALIGNMENT_THRESHOLD', DEFAULTS.alignmentThreshold),
    silenceNoiseDb: overrides.silenceNoiseDb ?? envNumber('SILENCE_NOISE_DB', DEFAULTS.silenceNoiseDb),
    minSilenceSec: overrides.minSilenceSec ?? envNumber('MIN_SILENCE_SEC', DEFAULTS.minSilenceSec),
    pauseShortMax: overrides.pauseShortMax ?? envNumber('PAUSE_SHORT_MAX', DEFAULTS.pauseShortMax),
    pauseMediumMax: overrides.pauseMediumMax ?? envNumber('PAUSE_MEDIUM_MAX', DEFAULTS.pauseMediumMax),
    pauseMinGap: overrides.pauseMinGap ?? envNumber('PAUSE_MIN_GAP', DEFAULTS.pauseMinGap)
  };
}
