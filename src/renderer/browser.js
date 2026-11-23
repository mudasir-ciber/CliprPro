/**
 * Resolve a Chromium/Chrome executable Playwright can launch on Windows.
 * Prefers Playwright's bundled Chromium; falls back to system Chrome/Edge.
 */
import fs from 'node:fs';
import { loadPlaywright } from './playwright.js';
import { VideoGenError, ErrorCodes } from '../utils/errors.js';

const WINDOWS_BROWSER_CANDIDATES = [
  process.env.CHROMIUM_PATH,
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe` : null,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean);

/**
 * @returns {Promise<{ executablePath?: string, channel?: string, label: string }>}
 */
export async function resolveBrowserLaunch(config = {}) {
  if (config.chromiumPath && fs.existsSync(config.chromiumPath)) {
    return { executablePath: config.chromiumPath, label: config.chromiumPath };
  }

  const pw = await loadPlaywright();
  const bundled = pw.chromium.executablePath();
  if (bundled && fs.existsSync(bundled)) {
    return { executablePath: bundled, label: bundled };
  }

  for (const candidate of WINDOWS_BROWSER_CANDIDATES) {
    if (candidate && fs.existsSync(candidate)) {
      return { executablePath: candidate, label: `system:${candidate}` };
    }
  }

  // Last resort: Playwright channel launch (may still work if Chrome registered)
  return { channel: 'chrome', label: 'channel:chrome' };
}

export async function checkBrowser(config = {}) {
  const launch = await resolveBrowserLaunch(config);
  if (launch.executablePath && fs.existsSync(launch.executablePath)) return launch.label;
  if (launch.channel) return launch.label;
  throw new VideoGenError(
    ErrorCodes.CHROMIUM_MISSING,
    'No Chromium/Chrome browser found.\nRun: npx playwright install chromium\nOr install Google Chrome, or set CHROMIUM_PATH in .env.',
    { details: JSON.stringify(launch) }
  );
}
