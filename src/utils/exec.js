import { spawn } from 'node:child_process';

const MAX_CAPTURE = 200_000;

/**
 * Run an executable WITHOUT a shell (safe for Windows paths with spaces).
 * Resolves with { code, stdout, stderr }. Rejects only if the process cannot start
 * (err.code === 'ENOENT' when the executable is not found).
 */
export function run(command, args, { cwd } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout = (stdout + d).slice(-MAX_CAPTURE);
    });
    child.stderr.on('data', (d) => {
      stderr = (stderr + d).slice(-MAX_CAPTURE);
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}
