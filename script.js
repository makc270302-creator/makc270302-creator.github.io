const files = [
  {
    title: 'Реестр расходных накладных',
    description: 'Инструкция по работе с реестром расходных накладных в 1С.',
    category: '1С',
    author: 'Менеджер по стандартизации Ромашов М.С.',
    uploadDate: '09.06.2026',
    path: 'files/Реестр расходных накладных.pdf'
  },
  {
    title: 'Расходные накладные',
    description: 'Просмотр, поиск и контроль расходных накладных.',
    category: '1С',
    author: 'Менеджер по стандартизации Ромашов М.С.',
    uploadDate: '09.06.2026',
    path: 'files/Расходные накладные.pdf'
  },
  {
    title: 'Расходная накладная',
    description: 'Подробная информация по накладной, операциям, истории изменений и данным развоза.',
    category: '1С',
    author: 'Менеджер по стандартизации Ромашов М.С.',
    uploadDate: '09.06.2026',
    path: 'files/Расходная накладная.pdf'
  },
  {
    title: 'Приходные накладные',
    description: 'Порядок работы с приходными документами и операциями.',
    category: '1С',
    author: 'Менеджер по стандартизации Ромашов М.С.',
    uploadDate: '09.06.2026',
    path: 'files/Приходные накладные.pdf'
  },
  {
    title: 'Инструкция по комплектации',
    description: 'Правила и порядок комплектации.',
    category: 'Комплектация',
    author: 'Менеджер по стандартизации Ромашов М.С.',
    uploadDate: '09.06.2026',
    path: 'files/Инструкция по комплектации.pdf'
  }
];

const fileList = document.getElementById('fileList');
const searchInput = document.getElementById('searchInput');
const categoryFilter = document.getElementById('categoryFilter');
const filesCount = document.getElementById('filesCount');
const emptyState = document.getElementById('emptyState');

function setupCategories() {
  const categories = ['Все категории', ...new Set(files.map((file) => file.category))];

  categoryFilter.innerHTML = '';

  categories.forEach((category) => {
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
        <div><span>Автор:</span> ${file.author}</div>
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

setupCategories();
searchInput.addEventListener('input', renderFiles);
categoryFilter.addEventListener('change', renderFiles);
renderFiles();
