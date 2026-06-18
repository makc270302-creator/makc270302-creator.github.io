export function normalizeText(value) {
  return String(value || '').toLowerCase().trim();
}

export function appendTextElement(parent, tagName, text, className = '') {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text;
  parent.appendChild(element);
  return element;
}

export function parseDate(value) {
  const text = String(value || '').trim();
  const ruMatch = text.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const parts = ruMatch
    ? [Number(ruMatch[3]), Number(ruMatch[2]), Number(ruMatch[1])]
    : isoMatch
      ? [Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3])]
      : null;

  if (!parts) return null;

  const [year, month, day] = parts;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? date
    : null;
}

export function isValidDate(value) {
  return Boolean(parseDate(value));
}

export function getDocumentPath(file) {
  const path = String(file?.path || '').trim().replace(/\\/g, '/');
  if (!/^files\/[^?#]+\.pdf$/i.test(path) || path.split('/').includes('..')) return null;
  return path;
}

export function sortDocuments(documents) {
  return [...documents].sort((a, b) =>
    String(a.title || '').localeCompare(String(b.title || ''), 'ru', { sensitivity: 'base' })
  );
}

function getDocumentUpdateTime(file) {
  return parseDate(file?.updatedDate)?.getTime()
    ?? parseDate(file?.uploadDate)?.getTime()
    ?? 0;
}

export function sortByDateDescending(a, b) {
  return getDocumentUpdateTime(b) - getDocumentUpdateTime(a);
}

export function sanitizeFileName(name) {
  return String(name || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 120);
}

export function todayRu() {
  return new Date().toLocaleDateString('ru-RU');
}

export function textToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary);
}

export function base64ToText(base64) {
  const binary = atob(base64.replace(/\n/g, ''));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
