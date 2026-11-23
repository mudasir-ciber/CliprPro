/**
 * Phase 9 long-form chunk planning.
 */
import fs from 'node:fs';
import path from 'node:path';
import { frameFileName } from '../pipeline/timeline.js';

/**
 * Split [0, totalFrames) into contiguous chunks.
 * @returns {{id:number, start:number, end:number}[]}
 */
export function planChunks(totalFrames, chunkSize = 90) {
  const n = Math.max(1, Math.floor(Number(totalFrames) || 0));
  const size = Math.max(1, Math.floor(Number(chunkSize) || 90));
  const chunks = [];
  for (let start = 0; start < n; start += size) {
    chunks.push({
      id: chunks.length,
      start,
      end: Math.min(n, start + size)
    });
  }
  return chunks;
}

/**
 * Resolve worker count for a job (auto long-form bump).
 */
export function resolveWorkerCount(totalFrames, config = {}) {
  let workers = Math.max(1, Math.floor(Number(config.renderWorkers) || 1));
  const auto = config.longFormAuto !== false;
  const minFrames = Number(config.longFormMinFrames) || 120;
  if (auto && totalFrames >= minFrames) {
    const autoWorkers = Math.max(1, Math.floor(Number(config.longFormWorkers) || 2));
    workers = Math.max(workers, autoWorkers);
  }
  return Math.min(workers, Math.max(1, totalFrames));
}

/**
 * List 0-based indices missing or too small on disk.
 */
export function missingFrameIndices(framesDir, totalFrames, minBytes = 64) {
  const missing = [];
  for (let i = 0; i < totalFrames; i++) {
    const fp = path.join(framesDir, frameFileName(i));
    if (!fs.existsSync(fp) || fs.statSync(fp).size < minBytes) missing.push(i);
  }
  return missing;
}

/** Filter chunks to only those that still need work when resuming. */
export function pendingChunks(chunks, missingSet) {
  if (!missingSet || missingSet.size === 0) return [];
  return chunks
    .map((c) => {
      const need = [];
      for (let i = c.start; i < c.end; i++) if (missingSet.has(i)) need.push(i);
      if (!need.length) return null;
      return { ...c, start: need[0], end: need[need.length - 1] + 1, indices: need };
    })
    .filter(Boolean);
}
