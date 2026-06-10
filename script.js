let files = [];
let changelog = [];

const CATEGORY_ICONS = {
  '1С': '🖥️',
  'Склад': '🏠',
  'Комплектация': '📦',
  'Потери': '📉',
  'Охрана труда': '🦺',
  'Пожарная безопасность': '🔥',
  'Зарядная станция': '⚡',
  'Проверка и формирование': '📋',
  'ФРОВ': '🍊',
  'Техника': '⚙️',
};

const fileList = document.getElementById('fileList');
const popularList = document.getElementById('popularList');
const popularSection = document.getElementById('popularSection');
const searchInput = document.getElementById('searchInput');
const categoryFilter = document.getElementById('categoryFilter');
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

function normalizeText(value) {
  return String(value || '').toLowerCase().trim();
}

function getCategoryIcon(category) {
  return CATEGORY_ICONS[category] || '📑';
}

function sortFiles() {
  files.sort((a, b) => a.title.localeCompare(b.title, 'ru', { sensitivity: 'base' }));
}

function setupCategories() {
  const uniqueCategories = [...new Set(files.map((file) => file.category))]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'ru', { sensitivity: 'base' }));

  categoryFilter.innerHTML = '';

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

  return files.filter((file) => {
    const matchesSearch =
      normalizeText(file.title).includes(search) ||
      normalizeText(file.description).includes(search) ||
      normalizeText(file.category).includes(search) ||
      normalizeText(file.author).includes(search) ||
      normalizeText(file.uploadDate).includes(search) ||
      normalizeText(file.version).includes(search);

    const matchesCategory = category === 'Все категории' || file.category === category;

    return matchesSearch && matchesCategory;
  });
}

function createMeta(file) {
  return `
    <div class="meta">
      <div><span>👤 Автор:</span> ${file.author || 'Не указан'}</div>
      <div><span>📅 Загружен:</span> ${file.uploadDate || '—'}</div>
      <div><span>🔄 Обновлён:</span> ${file.updatedDate || file.uploadDate || '—'}</div>
      <div><span>🏷️ Версия:</span> ${file.version || '1.0'}</div>
    </div>
  `;
}

function createCard(file) {
  const card = document.createElement('article');
  card.className = 'file-card';
  const encodedPath = encodeURI(file.path);

  card.innerHTML = `
    <div class="card-top">
      <div class="file-icon">${getCategoryIcon(file.category)}</div>
      <span class="tag">${file.category}</span>
    </div>
    <h2>${file.title}</h2>
    <p>${file.description}</p>
    ${createMeta(file)}
    <div class="actions actions--three">
      <button class="preview-link" type="button">Просмотр</button>
      <a class="open-link" href="${encodedPath}" target="_blank" rel="noopener">Открыть</a>
      <a class="download-link" href="${encodedPath}" download>Скачать</a>
    </div>
  `;

  card.querySelector('.preview-link').addEventListener('click', () => openViewer(file));
  return card;
}

function createPopularCard(file) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'popular-card';
  item.innerHTML = `
    <span>${getCategoryIcon(file.category)}</span>
    <strong>${file.title}</strong>
    <small>${file.category} · v${file.version || '1.0'}</small>
  `;
  item.addEventListener('click', () => openViewer(file));
  return item;
}

function renderFiles() {
  const filteredFiles = getFilteredFiles();

  fileList.innerHTML = '';
  filesCount.textContent = `${filteredFiles.length} / ${files.length}`;
  emptyState.hidden = filteredFiles.length > 0;

  filteredFiles.forEach((file) => fileList.appendChild(createCard(file)));
}

function renderPopular() {
  const popularFiles = files.filter((file) => file.popular).slice(0, 6);
  popularList.innerHTML = '';
  popularSection.hidden = popularFiles.length === 0;
  popularFiles.forEach((file) => popularList.appendChild(createPopularCard(file)));
}

function renderChangelog() {
  changelogList.innerHTML = '';

  changelog.forEach((item) => {
    const node = document.createElement('article');
    node.className = 'timeline-item';
    node.innerHTML = `
      <time>${item.date}</time>
      <div>
        <h3>${item.title}</h3>
        <p>${item.description}</p>
      </div>
    `;
    changelogList.appendChild(node);
  });
}

function updateDashboard() {
  const dates = files.map((file) => file.updatedDate || file.uploadDate).filter(Boolean);
  latestUpdate.textContent = dates.sort((a, b) => b.localeCompare(a, 'ru'))[0] || '—';
}

function openViewer(file) {
  const encodedPath = encodeURI(file.path);
  viewerTitle.textContent = file.title;
  viewerHint.hidden = true;
  pdfViewer.hidden = false;
  viewerActions.hidden = false;
  pdfViewer.src = encodedPath;
  viewerOpen.href = encodedPath;
  viewerDownload.href = encodedPath;
  viewerDownload.setAttribute('download', `${file.title}.pdf`);
  document.querySelector('.viewer-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

closeViewer.addEventListener('click', () => {
  pdfViewer.hidden = true;
  pdfViewer.src = '';
  viewerActions.hidden = true;
  viewerHint.hidden = false;
  viewerTitle.textContent = 'Выберите документ';
});

async function loadDocuments() {
  try {
    const [documentsResponse, changelogResponse] = await Promise.all([
      fetch('documents.json?v=' + Date.now()),
      fetch('changelog.json?v=' + Date.now())
    ]);

    if (!documentsResponse.ok) throw new Error('Не удалось загрузить documents.json');

    files = await documentsResponse.json();
    changelog = changelogResponse.ok ? await changelogResponse.json() : [];

    sortFiles();
    setupCategories();
    updateDashboard();
    renderPopular();
    renderFiles();
    renderChangelog();
  } catch (error) {
    fileList.innerHTML = `<div class="empty-state"><h2>Ошибка загрузки списка</h2><p>${error.message}</p></div>`;
    filesCount.textContent = '0 / 0';
  }
}

searchInput.addEventListener('input', renderFiles);
categoryFilter.addEventListener('change', renderFiles);
loadDocuments();
