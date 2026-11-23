/**
 * Phase 10 production delivery manifest builders.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pkg = JSON.parse(
  fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json'), 'utf8')
);

export const AI_DISCLOSURE =
  'This video was produced with CliprPro, a code-driven pipeline (script + voiceover → deterministic HTML/Canvas or WebGL frames → FFmpeg). Visuals are programmatic, not a generative text-to-video model.';

/**
 * Derive publishable titles from script sentences.
 */
export function suggestTitles(script, { max = 3 } = {}) {
  const sentences = (script?.sentences || []).map((s) => String(s.text || '').trim()).filter(Boolean);
  const titles = [];
  if (sentences[0]) titles.push(clip(sentences[0], 70));
  if (sentences[1]) titles.push(clip(`${sentences[0]?.split(/\s+/).slice(0, 4).join(' ') || 'Clip'}: ${sentences[1]}`, 70));
  const hook = sentences.find((t) => /\?$/.test(t));
  if (hook) titles.push(clip(hook.replace(/\?$/, ''), 70));
  return [...new Set(titles)].slice(0, max);
}

/**
 * Chapters from timeline scenes / narrative segments.
 */
export function buildChapters(timelineDoc, storyboard) {
  const scenes = timelineDoc?.scenes || [];
  if (!scenes.length && storyboard?.shots?.length) {
    return storyboard.shots.map((shot, i) => ({
      index: i + 1,
      start: Number(shot.start) || 0,
      end: Number(shot.end) || 0,
      title: clip(shot.narrationText || shot.segmentType || `Chapter ${i + 1}`, 60),
      role: shot.segmentType || null
    }));
  }
  return scenes.map((sc, i) => ({
    index: i + 1,
    start: Number(sc.start) || 0,
    end: Number(sc.end) || 0,
    title: clip(sc.narration?.text || sc.segment?.type || `Chapter ${i + 1}`, 60),
    role: sc.segment?.type || null,
    sceneId: sc.id || null
  }));
}

export function suggestDescription({ script, chapters, durationSec }) {
  const first = script?.sentences?.[0]?.text || 'A CliprPro video.';
  const roles = [...new Set((chapters || []).map((c) => c.role).filter(Boolean))];
  const parts = [
    clip(first, 160),
    Number.isFinite(durationSec) ? `Duration: ${durationSec.toFixed(1)}s.` : null,
    roles.length ? `Narrative arc: ${roles.join(' → ')}.` : null,
    AI_DISCLOSURE
  ];
  return parts.filter(Boolean).join(' ');
}

/**
 * Build the delivery.json object (no I/O).
 */
export function buildDeliveryManifest({
  jobId,
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
  outputPath,
  thumbnailPath,
  sceneName
}) {
  const chapters = buildChapters(timelineDoc, storyboard);
  const titles = suggestTitles(script);
  return {
    version: '10.0',
    phase: 10,
    cliprproVersion: pkg.version,
    generatedAt: new Date().toISOString(),
    jobId: jobId || null,
    media: {
      video: outputPath ? path.basename(outputPath) : 'final.mp4',
      thumbnail: thumbnailPath ? path.basename(thumbnailPath) : null,
      durationSec: Number.isFinite(durationSec) ? Number(durationSec.toFixed(3)) : null,
      fps: fps || null,
      width: width || null,
      height: height || null,
      videoCodec: verification?.videoCodec || null,
      audioCodec: verification?.audioCodec || null
    },
    packaging: {
      titles,
      description: suggestDescription({ script, chapters, durationSec }),
      chapters,
      tags: deriveTags(storyboard, chapters),
      disclosure: AI_DISCLOSURE,
      scene: sceneName || null,
      planner: storyboard?.planner || null
    },
    quality: {
      qcPassed: qc?.passed ?? null,
      qcErrors: qc?.summary?.errorCount ?? null,
      qcWarnings: qc?.summary?.warningCount ?? null,
      repairAttempted: repair?.attempted ?? false,
      repairSuccess: repair?.success ?? null
    }
  };
}

function deriveTags(storyboard, chapters) {
  const tags = new Set(['cliprpro', 'code-driven-video']);
  for (const m of storyboard?.summary?.moods || []) tags.add(String(m));
  for (const c of chapters || []) if (c.role) tags.add(String(c.role));
  return [...tags].slice(0, 16);
}

function clip(text, n) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (s.length <= n) return s;
  return `${s.slice(0, n - 1).trim()}…`;
}

export function readPackageVersion() {
  return pkg.version;
}

export function phaseStatusTable() {
  return [
    { phase: 1, name: 'Foundation', status: 'complete' },
    { phase: 2, name: 'Timeline / analysis', status: 'complete' },
    { phase: 3, name: 'Storyboard', status: 'complete' },
    { phase: 4, name: 'Advanced 2D', status: 'complete' },
    { phase: 5, name: 'Three.js', status: 'complete' },
    { phase: 6, name: 'Cinematic camera', status: 'complete' },
    { phase: 7, name: 'Visual QC', status: 'complete' },
    { phase: 8, name: 'Self-repair', status: 'complete' },
    { phase: 9, name: 'Long-form render', status: 'complete' },
    { phase: 10, name: 'Production packaging', status: 'complete' }
  ];
}

/** Resolve absolute paths that may be missing. */
export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
