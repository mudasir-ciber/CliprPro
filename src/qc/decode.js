/**
 * Decode PNG frames to raw RGB via FFmpeg (no image library dependency).
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { run } from '../utils/exec.js';
import { VideoGenError, ErrorCodes } from '../utils/errors.js';

/** QC thumbnail size — fixed so buffer length is known. */
export const QC_THUMB_W = 160;
export const QC_THUMB_H = 90;

/**
 * Probe PNG width/height with ffprobe.
 */
export async function probePng(filePath, ffprobePath) {
  const r = await run(ffprobePath, [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height',
    '-of', 'json',
    filePath
  ]);
  if (r.code !== 0) {
    throw new VideoGenError(ErrorCodes.QC_FAILED, `Could not probe frame ${path.basename(filePath)}`, {
      details: r.stderr
    });
  }
  const info = JSON.parse(r.stdout || '{}');
  const stream = (info.streams || [])[0] || {};
  return { width: Number(stream.width), height: Number(stream.height) };
}

/**
 * Decode a PNG to a fixed-size RGB24 Buffer for QC stats.
 * @returns {Promise<{buf:Buffer, width:number, height:number}>}
 */
export function decodePngRgb(filePath, ffmpegPath, { width = QC_THUMB_W, height = QC_THUMB_H } = {}) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) {
      reject(new VideoGenError(ErrorCodes.QC_FAILED, `Missing frame file: ${path.basename(filePath)}`));
      return;
    }
    const args = [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      filePath,
      '-vf',
      `scale=${width}:${height}`,
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgb24',
      'pipe:1'
    ];
    const child = spawn(ffmpegPath, args, { windowsHide: true });
    const chunks = [];
    let stderr = '';
    child.stdout.on('data', (d) => chunks.push(d));
    child.stderr.on('data', (d) => {
      stderr = (stderr + d).slice(-8000);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(
          new VideoGenError(ErrorCodes.QC_FAILED, `FFmpeg decode failed for ${path.basename(filePath)}`, {
            details: stderr
          })
        );
        return;
      }
      const buf = Buffer.concat(chunks);
      const expected = width * height * 3;
      if (buf.length < expected) {
        reject(
          new VideoGenError(ErrorCodes.QC_FAILED, `Short RGB buffer for ${path.basename(filePath)}`, {
            details: `got ${buf.length}, expected ${expected}`
          })
        );
        return;
      }
      resolve({ buf: buf.subarray(0, expected), width, height });
    });
  });
}

/**
 * Build a contact-sheet PNG from selected frame files (ffmpeg multi-input tile).
 */
export async function buildContactSheet({ framePaths, outputPath, ffmpegPath, tileCols = 4, thumbWidth = 240 }) {
  if (!framePaths.length) return null;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const n = Math.min(framePaths.length, 16);
  const paths = framePaths.slice(0, n);
  const cols = Math.min(tileCols, paths.length);
  const args = ['-y', '-hide_banner', '-loglevel', 'error'];
  for (const p of paths) {
    args.push('-i', p);
  }
  const scaled = paths.map((_, i) => `[${i}:v]scale=${thumbWidth}:-1,setsar=1[s${i}]`).join(';');
  const stackIn = paths.map((_, i) => `[s${i}]`).join('');
  const filter = `${scaled};${stackIn}xstack=inputs=${paths.length}:layout=${xstackLayout(cols, paths.length)}[v]`;
  args.push('-filter_complex', filter, '-map', '[v]', '-frames:v', '1', outputPath);

  const r = await run(ffmpegPath, args);
  if (r.code !== 0 || !fs.existsSync(outputPath)) return null;
  return outputPath;
}

function xstackLayout(cols, count) {
  const cells = [];
  for (let i = 0; i < count; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    cells.push(`${c === 0 ? '0' : `w0*${c}`}_${r === 0 ? '0' : `h0*${r}`}`);
  }
  return cells.join('|');
}
