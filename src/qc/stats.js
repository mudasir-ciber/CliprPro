/**
 * Pixel stats helpers for Phase 7 visual QC (no image libs).
 */

/** Simple FNV-1a 32-bit hash over a Buffer (for freeze detection). */
export function hashBuffer(buf) {
  let h = 0x811c9dc5;
  for (let i = 0; i < buf.length; i++) {
    h ^= buf[i];
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Analyze raw RGB24 buffer.
 * @returns {{meanLuma:number, variance:number, meanR:number, meanG:number, meanB:number, nearBlack:boolean, lowVariance:boolean}}
 */
export function analyzeRgb24(buf, { blackLuma = 12, lowVar = 40 } = {}) {
  const pixels = Math.floor(buf.length / 3);
  if (pixels < 1) {
    return { meanLuma: 0, variance: 0, meanR: 0, meanG: 0, meanB: 0, nearBlack: true, lowVariance: true };
  }
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumY = 0;
  let sumY2 = 0;
  // Subsample for speed on large frames
  const step = pixels > 200_000 ? 4 : pixels > 50_000 ? 2 : 1;
  let n = 0;
  for (let i = 0; i < pixels; i += step) {
    const o = i * 3;
    const r = buf[o];
    const g = buf[o + 1];
    const b = buf[o + 2];
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sumR += r;
    sumG += g;
    sumB += b;
    sumY += y;
    sumY2 += y * y;
    n++;
  }
  const meanR = sumR / n;
  const meanG = sumG / n;
  const meanB = sumB / n;
  const meanLuma = sumY / n;
  const variance = Math.max(0, sumY2 / n - meanLuma * meanLuma);
  return {
    meanLuma: Number(meanLuma.toFixed(3)),
    variance: Number(variance.toFixed(3)),
    meanR: Number(meanR.toFixed(3)),
    meanG: Number(meanG.toFixed(3)),
    meanB: Number(meanB.toFixed(3)),
    nearBlack: meanLuma < blackLuma,
    lowVariance: variance < lowVar
  };
}

/** Pick evenly spaced 0-based frame indices to sample. */
export function pickSampleIndices(totalFrames, maxSamples = 24) {
  const n = Math.max(1, Math.min(maxSamples, totalFrames));
  if (totalFrames <= n) return Array.from({ length: totalFrames }, (_, i) => i);
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(Math.min(totalFrames - 1, Math.round((i * (totalFrames - 1)) / (n - 1))));
  }
  return [...new Set(out)];
}
