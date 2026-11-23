/**
 * Phase 7 visual QC — inspect rendered PNG frames before encode.
 *
 * Writes analysis/qc.json (+ optional contact sheet). Hard failures throw QC_FAILED
 * unless skipQc / failOnError=false. Soft issues become warnings.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { frameFileName } from '../pipeline/timeline.js';
import { VideoGenError, ErrorCodes } from '../utils/errors.js';
import { analyzeRgb24, hashBuffer, pickSampleIndices } from './stats.js';
import { probePng, decodePngRgb, buildContactSheet } from './decode.js';

const MIN_FRAME_BYTES = 64;

/**
 * @param {object} opts
 * @param {string} opts.framesDir
 * @param {{totalFrames:number, fps:number, durationSec?:number}} opts.timeline
 * @param {number} opts.width
 * @param {number} opts.height
 * @param {object} opts.config
 * @param {object} [opts.storyboard]
 * @param {object} [opts.timelineDoc] narrative timeline with scenes
 * @param {string} [opts.outDir] analysis dir for qc.json
 * @param {object} [opts.logger]
 */
export async function runVisualQc(opts) {
  const {
    framesDir,
    timeline,
    width,
    height,
    config,
    storyboard,
    timelineDoc,
    outDir,
    logger
  } = opts;

  const started = Date.now();
  const issues = [];
  const samples = [];
  const totalFrames = timeline.totalFrames;
  const maxSamples = config.qcMaxSamples || 24;
  const sampleIdx = pickSampleIndices(totalFrames, maxSamples);

  // --- Integrity ---
  const missing = [];
  const tiny = [];
  for (let i = 0; i < totalFrames; i++) {
    const name = frameFileName(i);
    const fp = path.join(framesDir, name);
    if (!fs.existsSync(fp)) {
      missing.push(name);
      continue;
    }
    const size = fs.statSync(fp).size;
    if (size < MIN_FRAME_BYTES) tiny.push({ file: name, bytes: size });
  }
  if (missing.length) {
    issues.push({
      code: 'MISSING_FRAMES',
      severity: 'error',
      message: `${missing.length} frame(s) missing (e.g. ${missing.slice(0, 3).join(', ')})`,
      count: missing.length
    });
  }
  if (tiny.length) {
    issues.push({
      code: 'TINY_FRAMES',
      severity: 'error',
      message: `${tiny.length} frame(s) under ${MIN_FRAME_BYTES} bytes`,
      count: tiny.length
    });
  }

  const presentCount = totalFrames - missing.length;
  if (presentCount === 0) {
    return finalize({
      issues,
      samples,
      totalFrames,
      presentCount,
      sampleIdx,
      started,
      outDir,
      contactSheet: null,
      storyboard,
      config,
      logger
    });
  }

  // --- Resolution (first present sample) ---
  const firstIdx = sampleIdx.find((i) => !missing.includes(frameFileName(i))) ?? 0;
  const firstPath = path.join(framesDir, frameFileName(firstIdx));
  if (fs.existsSync(firstPath)) {
    try {
      const dim = await probePng(firstPath, config.ffprobePath);
      if (dim.width !== width || dim.height !== height) {
        issues.push({
          code: 'RESOLUTION_MISMATCH',
          severity: 'error',
          message: `Frame resolution ${dim.width}x${dim.height} ≠ expected ${width}x${height}`,
          actual: dim,
          expected: { width, height }
        });
      }
    } catch (err) {
      issues.push({
        code: 'PROBE_FAILED',
        severity: 'error',
        message: err.message || 'Frame probe failed'
      });
    }
  }

  // --- Sample pixel stats ---
  const blackFrames = [];
  const lowVarFrames = [];
  const hashes = [];
  for (const i of sampleIdx) {
    const name = frameFileName(i);
    const fp = path.join(framesDir, name);
    if (!fs.existsSync(fp)) continue;
    try {
      const { buf } = await decodePngRgb(fp, config.ffmpegPath);
      const stats = analyzeRgb24(buf, {
        blackLuma: config.qcBlackLuma ?? 12,
        lowVar: config.qcLowVariance ?? 40
      });
      const hash = hashBuffer(buf);
      const entry = {
        index: i,
        timeSec: Number((i / timeline.fps).toFixed(3)),
        file: name,
        hash,
        ...stats
      };
      samples.push(entry);
      hashes.push({ index: i, hash });
      if (stats.nearBlack) blackFrames.push(entry);
      if (stats.lowVariance) lowVarFrames.push(entry);
    } catch (err) {
      issues.push({
        code: 'DECODE_FAILED',
        severity: 'warning',
        message: `Could not decode ${name}: ${err.message}`
      });
    }
  }

  if (blackFrames.length) {
    const ratio = blackFrames.length / Math.max(1, samples.length);
    issues.push({
      code: 'BLACK_FRAMES',
      severity: ratio >= 0.5 ? 'error' : 'warning',
      message: `${blackFrames.length}/${samples.length} sampled frames near-black`,
      frames: blackFrames.map((f) => f.index)
    });
  }
  if (lowVarFrames.length >= Math.max(3, Math.ceil(samples.length * 0.6))) {
    issues.push({
      code: 'LOW_VARIANCE',
      severity: 'warning',
      message: `${lowVarFrames.length}/${samples.length} sampled frames look flat/empty`,
      frames: lowVarFrames.map((f) => f.index)
    });
  }

  // Freeze: consecutive identical sample hashes spanning meaningful duration
  let freezeRun = 1;
  let maxFreeze = 1;
  let freezeAt = null;
  for (let k = 1; k < hashes.length; k++) {
    if (hashes[k].hash === hashes[k - 1].hash) {
      freezeRun++;
      if (freezeRun > maxFreeze) {
        maxFreeze = freezeRun;
        freezeAt = hashes[k - freezeRun + 1]?.index ?? hashes[k].index;
      }
    } else freezeRun = 1;
  }
  // samples are spaced — if 3+ consecutive samples identical, likely frozen stretch
  if (maxFreeze >= 3) {
    issues.push({
      code: 'FROZEN_STREAK',
      severity: 'warning',
      message: `${maxFreeze} consecutive samples identical (possible freeze)`,
      startIndex: freezeAt
    });
  }

  // --- Shot coverage (mid-shot not black) ---
  const scenes = timelineDoc?.scenes || storyboard?.shots || [];
  const shotIssues = [];
  for (const shot of scenes) {
    const start = Number(shot.start);
    const end = Number(shot.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const midT = (start + end) / 2;
    const midIdx = Math.min(totalFrames - 1, Math.max(0, Math.floor(midT * timeline.fps)));
    const name = frameFileName(midIdx);
    const fp = path.join(framesDir, name);
    if (!fs.existsSync(fp)) {
      shotIssues.push({ sceneId: shot.id || shot.sceneId, index: midIdx, reason: 'missing' });
      continue;
    }
    let sample = samples.find((s) => s.index === midIdx);
    if (!sample) {
      try {
        const { buf } = await decodePngRgb(fp, config.ffmpegPath);
        const stats = analyzeRgb24(buf, {
          blackLuma: config.qcBlackLuma ?? 12,
          lowVar: config.qcLowVariance ?? 40
        });
        sample = { index: midIdx, ...stats };
      } catch {
        continue;
      }
    }
    if (sample.nearBlack) {
      shotIssues.push({ sceneId: shot.id || shot.sceneId, index: midIdx, reason: 'black' });
    }
  }
  if (shotIssues.length) {
    issues.push({
      code: 'SHOT_COVERAGE',
      severity: shotIssues.length >= Math.max(2, Math.ceil(scenes.length * 0.5)) ? 'error' : 'warning',
      message: `${shotIssues.length} shot midpoints look bad`,
      shots: shotIssues
    });
  }

  // --- Contact sheet ---
  let contactSheet = null;
  if (config.qcContactSheet !== false && outDir) {
    const sheetPath = path.join(outDir, 'qc-contact.png');
    const framePaths = sampleIdx
      .map((i) => path.join(framesDir, frameFileName(i)))
      .filter((p) => fs.existsSync(p))
      .slice(0, 12);
    contactSheet = await buildContactSheet({
      framePaths,
      outputPath: sheetPath,
      ffmpegPath: config.ffmpegPath
    });
  }

  return finalize({
    issues,
    samples,
    totalFrames,
    presentCount,
    sampleIdx,
    started,
    outDir,
    contactSheet,
    storyboard,
    config,
    logger
  });
}

function finalize({
  issues,
  samples,
  totalFrames,
  presentCount,
  sampleIdx,
  started,
  outDir,
  contactSheet,
  storyboard,
  config,
  logger
}) {
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const strict = config.qcStrict === true;
  const failOnError = config.qcFailOnError !== false;
  const passed = errors.length === 0 && (!strict || warnings.length === 0);

  const report = {
    version: '7.0',
    phase: 7,
    generatedAt: new Date().toISOString(),
    passed,
    summary: {
      totalFrames,
      presentFrames: presentCount,
      samplesAnalyzed: samples.length,
      errorCount: errors.length,
      warningCount: warnings.length,
      meanLuma:
        samples.length > 0
          ? Number((samples.reduce((a, s) => a + s.meanLuma, 0) / samples.length).toFixed(2))
          : null
    },
    sampleIndices: sampleIdx,
    samples: samples.map((s) => ({
      index: s.index,
      timeSec: s.timeSec,
      file: s.file,
      meanLuma: s.meanLuma,
      variance: s.variance,
      nearBlack: s.nearBlack,
      lowVariance: s.lowVariance,
      hash: s.hash
    })),
    issues,
    contactSheet: contactSheet ? path.basename(contactSheet) : null,
    storyboardPlanner: storyboard?.planner || null,
    durationMs: Date.now() - started
  };

  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    const qcPath = path.join(outDir, 'qc.json');
    fs.writeFileSync(qcPath, JSON.stringify(report, null, 2));
    report.path = qcPath;
  }

  if (logger) {
    if (passed) logger.info(`Visual QC passed (${samples.length} samples, ${warnings.length} warning(s))`);
    else logger.warn(`Visual QC issues: ${errors.length} error(s), ${warnings.length} warning(s)`);
    for (const i of issues) logger.detail?.(`[QC ${i.severity}] ${i.code}: ${i.message}`);
  }

  if (!passed && failOnError && (errors.length > 0 || (strict && warnings.length > 0))) {
    const top = errors[0] || warnings[0];
    throw new VideoGenError(
      ErrorCodes.QC_FAILED,
      `Visual QC failed: ${top.message}`,
      { details: JSON.stringify({ errors: errors.length, warnings: warnings.length, codes: issues.map((i) => i.code) }) }
    );
  }

  return report;
}

/** Fingerprint helper exported for tests. */
export function contentFingerprint(buf) {
  return createHash('sha1').update(buf).digest('hex').slice(0, 12);
}
