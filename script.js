import {
  appendTextElement,
  getDocumentPath,
  normalizeText,
  parseDate,
  sortByDateDescending,
  sortDocuments
} from './common.js';

let files = [];
let changelog = [];
let categoryIcons = {};

const fileList = document.getElementById('fileList');
const popularList = document.getElementById('popularList');
const popularSection = document.getElementById('popularSection');
const searchInput = document.getElementById('searchInput');
const categoryFilter = document.getElementById('categoryFilter');
const sortFilter = document.getElementById('sortFilter');
const showArchived = document.getElementById('showArchived');
const documentsSummary = document.getElementById('documentsSummary');
const filesCount = document.getElementById('filesCount');
const categoriesCount = document.getElementById('categoriesCount');
const latestUpdate = document.getElementById('latestUpdate');
const emptyState = document.getElementById('emptyState');
const changelogList = document.getElementById('changelogList');
const pdfViewer = document.getElementById('pdfViewer');
const viewerTitle = document.getElementById('viewerTitle');
const viewerHint = document.getElementById('viewerHint');
const viewerActions = document.getElementById('viewerActions');
const viewerOpen = document.getElementById('viewerOpen');
const viewerDownload = document.getElementById('viewerDownload');
const closeViewer = document.getElementById('closeViewer');
const viewerStatus = document.getElementById('viewerStatus');
let viewerLoadTimer = null;

function getCategoryIcon(category) {
  return categoryIcons[category] || '📑';
}

function sortFiles() {
  files = sortDocuments(files);
}

function setupCategories() {
  const uniqueCategories = [...new Set([...Object.keys(categoryIcons), ...files.map((file) => file.category)])]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'ru', { sensitivity: 'base' }));

  categoryFilter.replaceChildren();

  ['Все категории', ...uniqueCategories].forEach((category) => {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category === 'Все категории' ? category : `${getCategoryIcon(category)} ${category}`;
    categoryFilter.appendChild(option);
  });

  categoriesCount.textContent = uniqueCategories.length;
}

function getFilteredFiles() {
  const search = normalizeText(searchInput.value);
  const category = categoryFilter.value;

  const filtered = files.filter((file) => {
    const matchesSearch =
      normalizeText(file.title).includes(search) ||
      normalizeText(file.description).includes(search) ||
      normalizeText(file.category).includes(search) ||
      normalizeText(file.author).includes(search) ||
      normalizeText(file.uploadDate).includes(search) ||
      normalizeText(file.version).includes(search);

    const matchesCategory = category === 'Все категории' || file.category === category;

    return matchesSearch && matchesCategory && (showArchived.checked || !file.archived);
  });

  return filtered.sort((a, b) => {
    if (sortFilter.value === 'title-desc') return String(b.title).localeCompare(String(a.title), 'ru');
    if (sortFilter.value === 'date-desc') return sortByDateDescending(a, b);
    if (sortFilter.value === 'date-asc') return sortByDateDescending(b, a);
    if (sortFilter.value === 'popular') return Number(Boolean(b.popular)) - Number(Boolean(a.popular))
      || String(a.title).localeCompare(String(b.title), 'ru');
    return String(a.title).localeCompare(String(b.title), 'ru');
  });
}

function createMeta(file) {
  const meta = document.createElement('div');
  meta.className = 'meta';

  [
    ['👤 Автор:', file.author || 'Не указан'],
    ['📅 Загружен:', file.uploadDate || '—'],
    ['🔄 Обновлён:', file.updatedDate || file.uploadDate || '—'],
    ['🏷️ Версия:', file.version || '1.0']
  ].forEach(([label, value]) => {
    const row = document.createElement('div');
    appendTextElement(row, 'span', label);
    row.append(document.createTextNode(` ${value}`));
    meta.appendChild(row);
  });

  return meta;
}

function createCard(file) {
  const card = document.createElement('article');
  card.className = 'file-card';
  const path = getDocumentPath(file);
  const encodedPath = path ? encodeURI(path) : null;
  const cardTop = document.createElement('div');
  cardTop.className = 'card-top';
  appendTextElement(cardTop, 'div', getCategoryIcon(file.category), 'file-icon');
  appendTextElement(cardTop, 'span', file.category || 'Без категории', 'tag');
  if (file.archived) appendTextElement(cardTop, 'span', 'Архив', 'tag tag--archive');
  card.appendChild(cardTop);
  appendTextElement(card, 'h2', file.title || 'Без названия');
  appendTextElement(card, 'p', file.description || '');
  card.appendChild(createMeta(file));

  const actions = document.createElement('div');
  actions.className = 'actions actions--three';
  const previewButton = appendTextElement(actions, 'button', 'Просмотр', 'preview-link');
  previewButton.type = 'button';
  previewButton.disabled = !encodedPath;

  if (encodedPath) {
    const openLink = appendTextElement(actions, 'a', 'Открыть', 'open-link');
    openLink.href = encodedPath;
    openLink.target = '_blank';
    openLink.rel = 'noopener';

    const downloadLink = appendTextElement(actions, 'a', 'Скачать', 'download-link');
    downloadLink.href = encodedPath;
    downloadLink.download = '';
  }

  previewButton.addEventListener('click', () => openViewer(file));
  card.appendChild(actions);
  return card;
}

function createPopularCard(file) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'popular-card';
  item.disabled = !getDocumentPath(file);
  appendTextElement(item, 'span', getCategoryIcon(file.category));
  appendTextElement(item, 'strong', file.title || 'Без названия');
  appendTextElement(item, 'small', `${file.category || 'Без категории'} · v${file.version || '1.0'}`);
  item.addEventListener('click', () => openViewer(file));
  return item;
}

function renderFiles() {
  const filteredFiles = getFilteredFiles();
  const availableFiles = showArchived.checked ? files : files.filter((file) => !file.archived);

  fileList.replaceChildren();
  filesCount.textContent = `${filteredFiles.length} / ${availableFiles.length}`;
  documentsSummary.textContent = showArchived.checked
    ? 'Показаны активные и архивные документы.'
    : 'Архивные документы скрыты.';
  emptyState.hidden = filteredFiles.length > 0;

  filteredFiles.forEach((file) => fileList.appendChild(createCard(file)));
}

function renderPopular() {
  const popularFiles = files.filter((file) => file.popular && !file.archived).slice(0, 6);
  popularList.replaceChildren();
  popularSection.hidden = popularFiles.length === 0;
  popularFiles.forEach((file) => popularList.appendChild(createPopularCard(file)));
}

function renderChangelog() {
  changelogList.replaceChildren();

  changelog.forEach((item) => {
    const node = document.createElement('article');
    node.className = 'timeline-item';
    appendTextElement(node, 'time', item.date || '—');
    const content = document.createElement('div');
    appendTextElement(content, 'h3', item.title || 'Изменение');
    appendTextElement(content, 'p', item.description || '');
    node.appendChild(content);
    changelogList.appendChild(node);
  });
}

function updateDashboard() {
  const latest = files
    .filter((file) => !file.archived)
    .map((file) => {
      const value = file.updatedDate || file.uploadDate;
      return { value, date: parseDate(value) };
    })
    .filter((item) => item.date)
    .sort((a, b) => b.date - a.date)[0];

  latestUpdate.textContent = latest?.value || '—';
}

function openViewer(file) {
  const path = getDocumentPath(file);
  if (!path) return;
  const encodedPath = encodeURI(path);
  viewerTitle.textContent = file.title;
  viewerHint.hidden = true;
  viewerStatus.hidden = false;
  viewerStatus.textContent = 'Загрузка PDF...';
  pdfViewer.hidden = false;
  viewerActions.hidden = false;
  pdfViewer.src = encodedPath;
  viewerOpen.href = encodedPath;
  viewerDownload.href = encodedPath;
  viewerDownload.setAttribute('download', `${file.title}.pdf`);
  clearTimeout(viewerLoadTimer);
  viewerLoadTimer = setTimeout(() => {
    viewerStatus.hidden = false;
    viewerStatus.textContent = 'Если PDF не появился, откройте его в новой вкладке.';
  }, 5000);
  document.querySelector('.viewer-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

pdfViewer.addEventListener('load', () => {
  clearTimeout(viewerLoadTimer);
  viewerStatus.hidden = true;
});

closeViewer.addEventListener('click', () => {
  clearTimeout(viewerLoadTimer);
  pdfViewer.hidden = true;
  pdfViewer.src = '';
  viewerActions.hidden = true;
  viewerHint.hidden = false;
  viewerStatus.hidden = true;
  viewerTitle.textContent = 'Выберите документ';
});

async function loadDocuments() {
  try {
    const [documentsResponse, changelogResponse, categoriesResponse] = await Promise.all([
      fetch('documents.json', { cache: 'no-cache' }),
      fetch('changelog.json', { cache: 'no-cache' }),
      fetch('categories.json', { cache: 'no-cache' })
    ]);

    if (!documentsResponse.ok) throw new Error('Не удалось загрузить documents.json');

    files = await documentsResponse.json();
    changelog = changelogResponse.ok ? await changelogResponse.json() : [];
    const categories = categoriesResponse.ok ? await categoriesResponse.json() : [];
    categoryIcons = Object.fromEntries(categories.map((category) => [category.name, category.icon]));

    sortFiles();
    setupCategories();
    updateDashboard();
    renderPopular();
    renderFiles();
    renderChangelog();
  } catch (error) {
    fileList.replaceChildren();
    const errorState = document.createElement('div');
    errorState.className = 'empty-state';
    appendTextElement(errorState, 'h2', 'Ошибка загрузки списка');
    appendTextElement(errorState, 'p', error.message);
    fileList.appendChild(errorState);
    filesCount.textContent = '0 / 0';
  }
}

searchInput.addEventListener('input', renderFiles);
categoryFilter.addEventListener('change', renderFiles);
sortFilter.addEventListener('change', renderFiles);
showArchived.addEventListener('change', renderFiles);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !pdfViewer.hidden) closeViewer.click();
});
loadDocuments();
