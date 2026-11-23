/**
 * Small structured logger: [INFO] / [WARN] / [ERROR] on console,
 * timestamped lines in the job log file once attachFile() is called.
 */
import fs from 'node:fs';
import path from 'node:path';

export function createLogger({ silent = false } = {}) {
  let filePath = null;
  const buffer = [];

  function write(level, message, { consoleOutput = true } = {}) {
    const stamp = new Date().toISOString();
    const fileLine = `${stamp} [${level}] ${message}\n`;
    if (filePath) fs.appendFileSync(filePath, fileLine);
    else buffer.push(fileLine);
    if (!silent && consoleOutput) {
      const out = level === 'ERROR' || level === 'WARN' ? console.error : console.log;
      out(`[${level}] ${message}`);
    }
  }

  return {
    info: (m) => write('INFO', m),
    warn: (m) => write('WARN', m),
    error: (m) => write('ERROR', m),
    /** Technical details (stack traces etc.): written to the log file only, never to the console. */
    detail: (m) => write('DETAIL', m, { consoleOutput: false }),
    /** Start writing to a file; anything logged before is flushed into it. */
    attachFile(file) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      filePath = file;
      if (buffer.length) {
        fs.appendFileSync(filePath, buffer.join(''));
        buffer.length = 0;
      }
    },
    get filePath() {
      return filePath;
    }
  };
}
