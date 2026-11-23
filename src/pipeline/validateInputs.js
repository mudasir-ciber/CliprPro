/**
 * Input validation: script file + voiceover file.
 * Throws VideoGenError with a clean message on any problem.
 */
import fs from 'node:fs';
import path from 'node:path';
import { SUPPORTED_AUDIO_EXTENSIONS } from '../config.js';
import { probeAudio } from '../audio/probe.js';
import { VideoGenError, ErrorCodes } from '../utils/errors.js';

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/** Short title/subtitle derived from the first two non-empty script lines. */
export function deriveTitles(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^#+\s*/, '').trim())
    .filter(Boolean);
  const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trim()}…` : s);
  return {
    title: clip(lines[0] || 'Untitled', 80),
    subtitle: lines[1] ? clip(lines[1], 120) : null
  };
}

export function validateScript(scriptPath) {
  if (!scriptPath) throw new VideoGenError(ErrorCodes.SCRIPT_MISSING, 'Script file not specified. Provide --script <path> or put script.txt in the input folder.');
  const abs = path.resolve(scriptPath);
  if (!isFile(abs)) throw new VideoGenError(ErrorCodes.SCRIPT_MISSING, `Script file not found: ${abs}`);
  const text = fs.readFileSync(abs, 'utf8').replace(/^\uFEFF/, '');
  if (!text.trim()) throw new VideoGenError(ErrorCodes.SCRIPT_EMPTY, `Script file is empty: ${abs}`);
  return { path: abs, text, bytes: Buffer.byteLength(text), ...deriveTitles(text) };
}

export function validateAudioFile(audioPath) {
  if (!audioPath) throw new VideoGenError(ErrorCodes.AUDIO_MISSING, 'Voiceover file not specified. Provide --audio <path> or put voiceover.mp3 in the input folder.');
  const abs = path.resolve(audioPath);
  if (!isFile(abs)) throw new VideoGenError(ErrorCodes.AUDIO_MISSING, `Voiceover file not found: ${abs}`);
  const ext = path.extname(abs).toLowerCase();
  if (!SUPPORTED_AUDIO_EXTENSIONS.includes(ext)) {
    throw new VideoGenError(
      ErrorCodes.AUDIO_UNSUPPORTED_FORMAT,
      `Unsupported audio format "${ext || '(none)'}". Supported: ${SUPPORTED_AUDIO_EXTENSIONS.join(', ')}`
    );
  }
  if (fs.statSync(abs).size === 0) throw new VideoGenError(ErrorCodes.AUDIO_INVALID, `Voiceover file is empty: ${abs}`);
  return abs;
}

/**
 * Validate script + audio and extract audio metadata with ffprobe.
 * @returns {Promise<{script: object, audio: object}>}
 */
export async function validateInputs({ scriptPath, audioPath, ffprobePath }) {
  const script = validateScript(scriptPath);
  const audioAbs = validateAudioFile(audioPath);
  const meta = await probeAudio(audioAbs, { ffprobePath });
  return { script, audio: { path: audioAbs, ...meta } };
}

/** Find script.txt + voiceover.(mp3|wav|m4a|aac) inside an input directory. */
export function resolveInputDir(dir) {
  const abs = path.resolve(dir);
  const scriptPath = path.join(abs, 'script.txt');
  let audioPath = null;
  for (const ext of SUPPORTED_AUDIO_EXTENSIONS) {
    const candidate = path.join(abs, `voiceover${ext}`);
    if (isFile(candidate)) {
      audioPath = candidate;
      break;
    }
  }
  return { scriptPath: isFile(scriptPath) ? scriptPath : null, audioPath };
}
