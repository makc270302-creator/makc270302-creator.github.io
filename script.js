let files = [];

const fileList = document.getElementById('fileList');
const searchInput = document.getElementById('searchInput');
const categoryFilter = document.getElementById('categoryFilter');
const filesCount = document.getElementById('filesCount');
const emptyState = document.getElementById('emptyState');

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
    option.textContent = category;
    categoryFilter.appendChild(option);
  });
}

function renderFiles() {
  const search = searchInput.value.toLowerCase().trim();
  const category = categoryFilter.value;

  const filteredFiles = files.filter((file) => {
    const matchesSearch =
      file.title.toLowerCase().includes(search) ||
      file.description.toLowerCase().includes(search) ||
      file.category.toLowerCase().includes(search) ||
      file.author.toLowerCase().includes(search) ||
      file.uploadDate.toLowerCase().includes(search);

    const matchesCategory = category === 'Все категории' || file.category === category;

    return matchesSearch && matchesCategory;
  });

  fileList.innerHTML = '';
  filesCount.textContent = `${filteredFiles.length} / ${files.length}`;
  emptyState.hidden = filteredFiles.length > 0;

  filteredFiles.forEach((file) => {
    const card = document.createElement('article');
    card.className = 'file-card';

    card.innerHTML = `
      <div class="file-icon">PDF</div>
      <span class="tag">${file.category}</span>
      <h2>${file.title}</h2>
      <p>${file.description}</p>
      <div class="meta">
        <div><span>👤 Автор:</span> ${file.author}</div>
        <div><span>📅 Дата загрузки:</span> ${file.uploadDate}</div>
      </div>
      <div class="actions">
        <a class="open-link" href="${encodeURI(file.path)}" target="_blank" rel="noopener">Открыть</a>
        <a class="download-link" href="${encodeURI(file.path)}" download>Скачать</a>
      </div>
    `;

    fileList.appendChild(card);
  });
}

async function loadDocuments() {
  try {
    const response = await fetch('documents.json?v=' + Date.now());

    if (!response.ok) {
      throw new Error('Не удалось загрузить documents.json');
    }

    files = await response.json();
    sortFiles();
    setupCategories();
    renderFiles();
  } catch (error) {
    fileList.innerHTML = `<div class="empty-state"><h2>Ошибка загрузки списка</h2><p>${error.message}</p></div>`;
    filesCount.textContent = '0 / 0';
  }
}

searchInput.addEventListener('input', renderFiles);
categoryFilter.addEventListener('change', renderFiles);
loadDocuments();
