/**
 * Stable content hashes for analysis caching (no crypto dependency beyond Node).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';

export function hashString(text) {
  return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex').slice(0, 16);
}

export function hashFile(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
}

export function cacheKey(parts) {
  return hashString(JSON.stringify(parts));
}
