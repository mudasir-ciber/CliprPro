/**
 * Analysis result caching keyed by script/audio/config hashes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { hashFile, hashString, cacheKey } from '../utils/hash.js';

export function buildCacheIdentity({ scriptPath, audioPath, configFingerprint }) {
  return {
    scriptHash: hashFile(scriptPath),
    audioHash: hashFile(audioPath),
    configHash: hashString(JSON.stringify(configFingerprint || {})),
    key: null
  };
}

export function finalizeIdentity(identity) {
  identity.key = cacheKey({
    scriptHash: identity.scriptHash,
    audioHash: identity.audioHash,
    configHash: identity.configHash
  });
  return identity;
}

export function readCache(cacheDir, key) {
  const file = path.join(cacheDir, `${key}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function writeCache(cacheDir, key, payload) {
  fs.mkdirSync(cacheDir, { recursive: true });
  const file = path.join(cacheDir, `${key}.json`);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  return file;
}

export function analysisCacheDir(projectRoot) {
  return path.join(projectRoot, '.cache', 'analysis');
}
