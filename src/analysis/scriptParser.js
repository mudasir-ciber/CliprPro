/**
 * Phase 2 script parser: headings, paragraphs, narration → stable sentence IDs.
 */
import { splitSentences, normalizeText, tokenize } from './normalize.js';

/**
 * @param {string} text
 * @returns {{
 *   version: string,
 *   originalText: string,
 *   normalizedText: string,
 *   headings: Array<{index:number, text:string}>,
 *   paragraphs: Array<{index:number, text:string, heading:string|null}>,
 *   sentences: Array<object>,
 *   stats: {sentenceCount:number, wordCount:number, charCount:number}
 * }}
 */
export function parseScript(text) {
  const originalText = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const lines = originalText.split('\n');

  const headings = [];
  const paragraphs = [];
  let currentHeading = null;
  let paraBuf = [];
  let paraIndex = 0;
  let headingIndex = 0;

  function flushPara() {
    const body = paraBuf.join('\n').trim();
    paraBuf = [];
    if (!body) return;
    paragraphs.push({
      index: paraIndex++,
      text: body,
      heading: currentHeading
    });
  }

  for (const line of lines) {
    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line.trim()) || /^([A-Z][A-Z0-9 ,.'’-]{2,80})$/.exec(line.trim());
    // Markdown headings always; ALL-CAPS short lines only if not mid-sentence-ish
    if (/^(#{1,6})\s+(.+)$/.exec(line.trim())) {
      flushPara();
      const m = /^(#{1,6})\s+(.+)$/.exec(line.trim());
      currentHeading = m[2].trim();
      headings.push({ index: headingIndex++, text: currentHeading, level: m[1].length });
      continue;
    }
    if (!line.trim()) {
      flushPara();
      continue;
    }
    // Narration block markers: NARRATOR: / VO: / [narration]
    const narr = /^(?:NARRATOR|NARRATION|VO|VOICEOVER)\s*:\s*(.+)$/i.exec(line.trim());
    if (narr) {
      flushPara();
      paraBuf.push(narr[1]);
      flushPara();
      continue;
    }
    paraBuf.push(line);
  }
  flushPara();

  const sentences = [];
  let globalIndex = 0;
  for (const para of paragraphs) {
    const parts = splitSentences(para.text);
    for (const part of parts) {
      const normalized = normalizeText(part);
      const words = tokenize(part);
      sentences.push({
        id: `S${String(globalIndex + 1).padStart(3, '0')}`,
        index: globalIndex,
        text: part.replace(/\s+/g, ' ').trim(),
        normalizedText: normalized,
        wordCount: words.length,
        charCount: part.replace(/\s+/g, ' ').trim().length,
        paragraphIndex: para.index,
        heading: para.heading
      });
      globalIndex++;
    }
  }

  // Fallback: if no paragraphs produced sentences but text exists, split whole doc
  if (!sentences.length && originalText.trim()) {
    for (const part of splitSentences(originalText)) {
      const words = tokenize(part);
      sentences.push({
        id: `S${String(globalIndex + 1).padStart(3, '0')}`,
        index: globalIndex,
        text: part.replace(/\s+/g, ' ').trim(),
        normalizedText: normalizeText(part),
        wordCount: words.length,
        charCount: part.replace(/\s+/g, ' ').trim().length,
        paragraphIndex: 0,
        heading: null
      });
      globalIndex++;
    }
  }

  const wordCount = sentences.reduce((n, s) => n + s.wordCount, 0);
  const charCount = sentences.reduce((n, s) => n + s.charCount, 0);

  return {
    version: '2.0',
    originalText,
    normalizedText: normalizeText(originalText),
    headings,
    paragraphs,
    sentences,
    stats: {
      sentenceCount: sentences.length,
      wordCount,
      charCount
    }
  };
}
