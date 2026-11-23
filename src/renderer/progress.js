/**
 * Phase 9 render progress checkpoint (resume support).
 */
import fs from 'node:fs';
import path from 'node:path';

export function progressPath(analysisDir) {
  return path.join(analysisDir, 'render-progress.json');
}

export function loadProgress(analysisDir) {
  const file = progressPath(analysisDir);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function saveProgress(analysisDir, data) {
  if (!analysisDir) return null;
  fs.mkdirSync(analysisDir, { recursive: true });
  const file = progressPath(analysisDir);
  const payload = {
    version: '9.0',
    phase: 9,
    updatedAt: new Date().toISOString(),
    ...data
  };
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  return file;
}

export function writeRenderReport(analysisDir, report) {
  if (!analysisDir) return null;
  fs.mkdirSync(analysisDir, { recursive: true });
  const file = path.join(analysisDir, 'render.json');
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        version: '9.0',
        phase: 9,
        generatedAt: new Date().toISOString(),
        ...report
      },
      null,
      2
    )
  );
  return file;
}
