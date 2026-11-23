/**
 * Text normalization helpers for alignment and comparison.
 */

const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'vs', 'etc', 'e.g', 'i.e', 'u.s', 'u.k'
]);

/** Lowercase, strip punctuation (keep apostrophes inside words), collapse whitespace. */
export function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/[^a-z0-9'\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tokenize for alignment. */
export function tokenize(text) {
  const n = normalizeText(text);
  if (!n) return [];
  return n.split(' ').filter(Boolean);
}

/**
 * Split prose into sentences without breaking decimals or common abbreviations.
 */
export function splitSentences(text) {
  const raw = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!raw) return [];

  const parts = [];
  let buf = '';
  const chars = [...raw];

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    buf += ch;

    if (!/[.!?…]/.test(ch)) continue;

    // Decimal: digit . digit
    if (ch === '.' && /\d/.test(chars[i - 1] || '') && /\d/.test(chars[i + 1] || '')) continue;

    // Abbreviation: look at last word before period
    if (ch === '.') {
      const before = buf.slice(0, -1);
      const m = before.match(/([A-Za-z]+)$/);
      if (m && ABBREVIATIONS.has(m[1].toLowerCase())) continue;
      // Single capital letter initials: "A. B. King"
      if (m && m[1].length === 1) continue;
    }

    // Ellipsis ...
    if (ch === '.' && chars[i + 1] === '.' && chars[i + 2] === '.') {
      buf += chars[++i];
      buf += chars[++i];
    }

    // Require following whitespace / end / quote to commit
    const next = chars[i + 1];
    if (next && !/[\s"'”’)\]}]/.test(next)) continue;

    const sentence = buf.trim();
    if (sentence) parts.push(sentence);
    buf = '';
  }

  const tail = buf.trim();
  if (tail) parts.push(tail);
  return parts;
}

/** Dice coefficient on token sets (0..1). */
export function tokenSimilarity(a, b) {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (!ta.size && !tb.size) return 1;
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return (2 * inter) / (ta.size + tb.size);
}
