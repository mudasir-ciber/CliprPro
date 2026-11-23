// Test 5: scene file generation/loading
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { generateScene } from '../src/scenes/index.js';
import { tmpDir } from './helpers.js';

const base = { title: 'Hello', subtitle: 'World', durationSec: 12.5, fps: 30, width: 1920, height: 1080 };

test('generateScene creates scene.html and scene.config.json', () => {
  const dir = tmpDir();
  const s = generateScene('basic', { sceneDir: dir, ...base });
  assert.ok(fs.existsSync(s.sceneHtmlPath));
  assert.ok(fs.existsSync(s.configPath));
  const html = fs.readFileSync(s.sceneHtmlPath, 'utf8');
  assert.match(html, /window\.renderAt\s*=/);
  assert.ok(!html.includes('__SCENE_CONFIG__'), 'placeholder must be replaced');
  const cfg = JSON.parse(fs.readFileSync(s.configPath, 'utf8'));
  assert.equal(cfg.durationSec, 12.5);
  assert.equal(cfg.width, 1920);
});

test('generateScene escapes hostile titles (no script injection)', () => {
  const dir = tmpDir();
  const s = generateScene('basic', { sceneDir: dir, ...base, title: '</script><script>alert(1)</script>' });
  const html = fs.readFileSync(s.sceneHtmlPath, 'utf8');
  assert.ok(!html.includes('<script>alert(1)'));
});

test('generateScene: unknown scene name is a clean error', () => {
  assert.throws(() => generateScene('nope', { sceneDir: tmpDir(), ...base }), { code: 'SCENE_GENERATION_FAILED' });
});

test('scene source avoids non-deterministic APIs', () => {
  const html = fs.readFileSync(path.join(import.meta.dirname, '..', 'src', 'scenes', 'basic', 'scene.template.html'), 'utf8');
  const code = html.split('<script>')[1];
  // strip comments so the explanatory header does not trigger the check
  const stripped = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const banned of ['Date.now', 'Math.random', 'requestAnimationFrame', 'performance.now', 'setTimeout', 'setInterval']) {
    assert.ok(!stripped.includes(banned), `scene must not use ${banned}`);
  }
});
