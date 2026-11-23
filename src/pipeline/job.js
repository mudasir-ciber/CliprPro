/**
 * Job system: one unique directory per generation request.
 *
 * jobs/job-YYYYMMDD-NNN/{input,audio,scenes,frames,output,logs}/ + metadata.json
 */
import fs from 'node:fs';
import path from 'node:path';

const SUBDIRS = ['input', 'audio', 'analysis', 'scenes', 'frames', 'output', 'logs'];

function datePart(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}`;
}

export function createJob({ jobsDir, now = new Date() }) {
  fs.mkdirSync(jobsDir, { recursive: true });
  const prefix = `job-${datePart(now)}-`;
  let n = fs.readdirSync(jobsDir).filter((d) => d.startsWith(prefix)).length + 1;

  for (let attempt = 0; attempt < 1000; attempt++, n++) {
    const id = `${prefix}${String(n).padStart(3, '0')}`;
    const dir = path.join(jobsDir, id);
    try {
      fs.mkdirSync(dir); // non-recursive: fails if it exists, so IDs never collide
    } catch (err) {
      if (err.code === 'EEXIST') continue;
      throw err;
    }
    const paths = { root: dir, metadata: path.join(dir, 'metadata.json') };
    for (const sub of SUBDIRS) {
      paths[sub] = path.join(dir, sub);
      fs.mkdirSync(paths[sub]);
    }
    return { id, dir, paths, createdAt: now.toISOString() };
  }
  throw new Error('Could not allocate a unique job ID.');
}

export function readMetadata(job) {
  try {
    return JSON.parse(fs.readFileSync(job.paths.metadata, 'utf8'));
  } catch {
    return {};
  }
}

/** Shallow-merge `patch` into metadata.json. */
export function updateMetadata(job, patch) {
  const next = { ...readMetadata(job), ...patch, updatedAt: new Date().toISOString() };
  fs.writeFileSync(job.paths.metadata, JSON.stringify(next, null, 2));
  return next;
}
