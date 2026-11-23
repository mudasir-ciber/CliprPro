/**
 * Phase 10: assemble production delivery artifacts for a completed job.
 */
import fs from 'node:fs';
import path from 'node:path';
import { run } from '../utils/exec.js';
import { VideoGenError, ErrorCodes } from '../utils/errors.js';
import { buildDeliveryManifest, ensureDir } from './manifest.js';

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

/**
 * Extract a thumbnail PNG from the final MP4 (hook ~12% in, clamped).
 */
export async function extractThumbnail({ videoPath, outputPath, durationSec, ffmpegPath }) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const t = Number.isFinite(durationSec) ? Math.min(Math.max(durationSec * 0.12, 0.1), Math.max(durationSec - 0.05, 0.1)) : 0.5;
  const r = await run(ffmpegPath, [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-ss',
    String(t.toFixed(3)),
    '-i',
    videoPath,
    '-frames:v',
    '1',
    '-q:v',
    '2',
    outputPath
  ]);
  if (r.code !== 0 || !fs.existsSync(outputPath)) {
    throw new VideoGenError(ErrorCodes.PACKAGE_FAILED, 'Could not extract thumbnail from final video.', {
      details: r.stderr
    });
  }
  return outputPath;
}

/**
 * Write chapters as YouTube-style timestamps + JSON.
 */
export function writeChaptersFiles(outDir, chapters) {
  const jsonPath = path.join(outDir, 'chapters.json');
  writeJson(jsonPath, { version: '10.0', chapters });
  const lines = (chapters || []).map((c) => `${formatTs(c.start)} ${c.title}`);
  const txtPath = path.join(outDir, 'chapters.txt');
  writeText(txtPath, `${lines.join('\n')}\n`);
  return { jsonPath, txtPath };
}

function formatTs(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  return `${m}:${String(r).padStart(2, '0')}`;
}

/**
 * Build full delivery bundle under job output/ (and optional delivery/ copy).
 *
 * @returns {Promise<object>} delivery manifest + paths
 */
export async function packageDelivery(opts) {
  const {
    job,
    script,
    timelineDoc,
    storyboard,
    qc,
    repair,
    verification,
    fps,
    width,
    height,
    durationSec,
    finalPath,
    config,
    logger,
    sceneName
  } = opts;

  const outDir = job.paths.output;
  ensureDir(outDir);
  if (!fs.existsSync(finalPath)) {
    throw new VideoGenError(ErrorCodes.PACKAGE_FAILED, `Missing final video: ${finalPath}`);
  }

  const thumbPath = path.join(outDir, 'thumbnail.jpg');
  try {
    await extractThumbnail({
      videoPath: finalPath,
      outputPath: thumbPath,
      durationSec,
      ffmpegPath: config.ffmpegPath
    });
  } catch (err) {
    logger?.warn(`Thumbnail extract failed: ${err.message}`);
  }

  const manifest = buildDeliveryManifest({
    jobId: job.id,
    script,
    timelineDoc,
    storyboard,
    qc,
    repair,
    verification,
    fps,
    width,
    height,
    durationSec,
    outputPath: finalPath,
    thumbnailPath: fs.existsSync(thumbPath) ? thumbPath : null,
    sceneName
  });

  const deliveryPath = path.join(outDir, 'delivery.json');
  writeJson(deliveryPath, manifest);
  writeText(path.join(outDir, 'description.txt'), `${manifest.packaging.description}\n`);
  writeText(path.join(outDir, 'disclosure.txt'), `${manifest.packaging.disclosure}\n`);
  writeText(path.join(outDir, 'titles.txt'), `${manifest.packaging.titles.join('\n')}\n`);
  const chapterFiles = writeChaptersFiles(outDir, manifest.packaging.chapters);

  // Optional flat delivery folder for handoff
  const deliveryDir = path.join(job.dir, 'delivery');
  ensureDir(deliveryDir);
  const copy = (src, name) => {
    if (src && fs.existsSync(src)) fs.copyFileSync(src, path.join(deliveryDir, name));
  };
  copy(finalPath, 'final.mp4');
  copy(thumbPath, 'thumbnail.jpg');
  copy(deliveryPath, 'delivery.json');
  copy(path.join(outDir, 'description.txt'), 'description.txt');
  copy(path.join(outDir, 'disclosure.txt'), 'disclosure.txt');
  copy(path.join(outDir, 'titles.txt'), 'titles.txt');
  copy(chapterFiles.jsonPath, 'chapters.json');
  copy(chapterFiles.txtPath, 'chapters.txt');

  logger?.info(`Delivery package ready: ${path.relative(process.cwd(), deliveryDir)}`);

  return {
    ...manifest,
    paths: {
      deliveryJson: deliveryPath,
      deliveryDir,
      thumbnail: fs.existsSync(thumbPath) ? thumbPath : null,
      chaptersJson: chapterFiles.jsonPath,
      chaptersTxt: chapterFiles.txtPath
    }
  };
}
