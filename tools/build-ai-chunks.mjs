import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const root = resolve(import.meta.dirname, '..');
const documents = JSON.parse(await readFile(resolve(root, 'documents.json'), 'utf8'))
  .filter((document) => !document.archived);
const chunks = [];

function normalize(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function splitText(text, maxLength = 2600, overlap = 300) {
  const result = [];
  let cursor = 0;
  while (cursor < text.length) {
    let end = Math.min(cursor + maxLength, text.length);
    if (end < text.length) {
      const sentenceEnd = Math.max(
        text.lastIndexOf('. ', end),
        text.lastIndexOf('; ', end),
        text.lastIndexOf(' ', end)
      );
      if (sentenceEnd > cursor + maxLength / 2) end = sentenceEnd + 1;
    }
    const part = text.slice(cursor, end).trim();
    if (part.length >= 80) result.push(part);
    if (end >= text.length) break;
    cursor = Math.max(cursor + 1, end - overlap);
  }
  return result;
}

for (const [documentIndex, document] of documents.entries()) {
  const bytes = new Uint8Array(await readFile(resolve(root, document.path)));
  const pdf = await getDocument({ data: bytes, useWorkerFetch: false, isEvalSupported: false }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = normalize(content.items.map((item) => item.str || '').join(' '));
    if (text) pages.push(`Страница ${pageNumber}. ${text}`);
  }

  const fullText = normalize(pages.join('\n'));
  const sourceText = fullText || normalize(`${document.title}. ${document.description}`);
  splitText(sourceText).forEach((text, chunkIndex) => {
    const hash = createHash('sha256').update(`${document.path}:${chunkIndex}`).digest('hex').slice(0, 32);
    chunks.push({
      id: hash,
      title: document.title,
      filename: basename(document.path),
      path: document.path,
      category: document.category,
      text
    });
  });
  console.log(`[${documentIndex + 1}/${documents.length}] ${document.title}: ${pdf.numPages} pages`);
}

const output = resolve(root, '.ai-chunks.json');
await writeFile(output, JSON.stringify(chunks), 'utf8');
console.log(`AI_CHUNKS=${chunks.length}`);
console.log(`AI_CHUNKS_FILE=${output}`);
