import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const errors = [];
const datePattern = /^(\d{2})\.(\d{2})\.(\d{4})$/;
const pathPattern = /^files\/[^?#]+\.pdf$/i;

function validDate(value) {
  const match = String(value || '').match(datePattern);
  if (!match) return false;
  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

async function readJson(fileName) {
  try {
    return JSON.parse(await readFile(path.join(root, fileName), 'utf8'));
  } catch (error) {
    errors.push(`${fileName}: ${error.message}`);
    return [];
  }
}

const documents = await readJson('documents.json');
const changelog = await readJson('changelog.json');
await readJson('documents.schema.json');
await readJson('changelog.schema.json');
const requiredDocumentFields = [
  'title', 'description', 'category', 'author', 'uploadDate',
  'updatedDate', 'version', 'popular', 'icon', 'path'
];
const titles = new Set();
const paths = new Set();

if (!Array.isArray(documents)) errors.push('documents.json должен содержать массив.');

for (const [index, documentItem] of documents.entries()) {
  const label = `documents.json[${index}]`;
  if (!documentItem || typeof documentItem !== 'object' || Array.isArray(documentItem)) {
    errors.push(`${label}: требуется объект.`);
    continue;
  }
  for (const field of requiredDocumentFields) {
    if (!(field in documentItem)) errors.push(`${label}: отсутствует поле ${field}.`);
  }
  for (const field of ['title', 'description', 'category', 'author', 'version', 'path']) {
    if (typeof documentItem[field] !== 'string' || !documentItem[field].trim()) {
      errors.push(`${label}.${field}: требуется непустая строка.`);
    }
  }
  if (typeof documentItem.popular !== 'boolean') errors.push(`${label}.popular: требуется boolean.`);
  if (!validDate(documentItem.uploadDate) || !validDate(documentItem.updatedDate)) {
    errors.push(`${label}: некорректная дата.`);
  }
  if (!pathPattern.test(documentItem.path) || documentItem.path.split('/').includes('..')) {
    errors.push(`${label}.path: небезопасный путь.`);
  } else {
    try {
      await access(path.join(root, documentItem.path));
    } catch {
      errors.push(`${label}.path: PDF не найден (${documentItem.path}).`);
    }
  }

  const normalizedTitle = String(documentItem.title || '').toLocaleLowerCase('ru-RU').trim();
  if (titles.has(normalizedTitle)) errors.push(`${label}: дублирующееся название.`);
  if (paths.has(documentItem.path)) errors.push(`${label}: дублирующийся путь.`);
  titles.add(normalizedTitle);
  paths.add(documentItem.path);
}

if (!Array.isArray(changelog)) errors.push('changelog.json должен содержать массив.');
if (changelog.length > 30) errors.push('changelog.json должен содержать не более 30 записей.');

for (const [index, item] of changelog.entries()) {
  const label = `changelog.json[${index}]`;
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    errors.push(`${label}: требуется объект.`);
    continue;
  }
  if (!validDate(item.date)) errors.push(`${label}.date: некорректная дата.`);
  for (const field of ['title', 'description']) {
    if (typeof item[field] !== 'string' || !item[field].trim()) {
      errors.push(`${label}.${field}: требуется непустая строка.`);
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(`Проверено документов: ${documents.length}; записей истории: ${changelog.length}.`);
