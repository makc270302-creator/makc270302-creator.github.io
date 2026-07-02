import { readFile } from 'node:fs/promises';

const errors = [];
const index = await readFile('index.html', 'utf8');
const script = await readFile('script.js', 'utf8');
const manifest = JSON.parse(await readFile('manifest.webmanifest', 'utf8'));
const app = JSON.parse(await readFile('app.json', 'utf8'));

for (const id of [
  'portalVersion', 'exportCsvButton', 'showMoreFilesButton', 'showMoreChangelogButton',
  'relatedSection', 'activeFilters', 'recentSection', 'aiForm', 'aiQuestion',
  'aiAnswer', 'aiSourcesList'
]) {
  if (!index.includes(`id="${id}"`)) errors.push(`index.html: отсутствует #${id}.`);
}

for (const feature of [
  'serviceWorker.register', 'exportFilteredCsv', 'renderRelated', 'renderRecent',
  'askAiAssistant', 'renderAiSources'
]) {
  if (!script.includes(feature)) errors.push(`script.js: отсутствует ${feature}.`);
}

if (!/^\d+\.\d+\.\d+$/.test(app.version || '')) errors.push('app.json: version должна иметь формат X.Y.Z.');
if (!manifest.name || !manifest.start_url || !Array.isArray(manifest.icons) || !manifest.icons.length) {
  errors.push('manifest.webmanifest: обязательные PWA-поля не заполнены.');
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(`Портал: версия ${app.version}; обязательные элементы и PWA-конфигурация присутствуют.`);
