const files = [
  {
    title: 'Реестр расходных накладных',
    description: 'Инструкция по работе с реестром расходных накладных в 1С.',
    category: '1С',
    categoryName: '1С',
    path: 'files/Реестр расходных накладных.pdf'
  },
  
  {
    title: 'Приходные накладные',
    description: 'Порядок работы с приходными документами и операциями.',
    category: '1С',
    categoryName: '1С',
    path: 'files/Приходные накладные.pdf'
  },
   {
    title: 'Инструкция по комплектации',
    description: 'Правила и порядок комплектации.',
    category: 'Комплектация',
    categoryName: 'Комплектация',
    path: 'files/Инструкция по комплектации.pdf'     
  },
    {
    title: 'Инструкция по комплектации213213',
    description: 'Правила и порядок комплектации.',
    category: 'Комплектация',
    categoryName: 'Комплектация',
    path: 'files/Инструкция по комплектации.pdf'     
  }
];

const fileList = document.getElementById('fileList');
const searchInput = document.getElementById('searchInput');
const categoryFilter = document.getElementById('categoryFilter');
const filesCount = document.getElementById('filesCount');
const emptyState = document.getElementById('emptyState');

function renderFiles() {
  const search = searchInput.value.toLowerCase().trim();
  const category = categoryFilter.value;

  const filteredFiles = files.filter((file) => {
    const matchesSearch =
      file.title.toLowerCase().includes(search) ||
      file.description.toLowerCase().includes(search);

    const matchesCategory = category === 'Все категории' || file.category === category;

    return matchesSearch && matchesCategory;
  });

  fileList.innerHTML = '';
  filesCount.textContent = filteredFiles.length;
  emptyState.hidden = filteredFiles.length > 0;

  filteredFiles.forEach((file) => {
    const card = document.createElement('article');
    card.className = 'file-card';

    card.innerHTML = `
      <div class="file-icon">PDF</div>
      <span class="tag">${file.categoryName}</span>
      <h2>${file.title}</h2>
      <p>${file.description}</p>
      <div class="actions">
        <a class="open-link" href="${file.path}" target="_blank">Открыть</a>
        <a class="download-link" href="${file.path}" download>Скачать</a>
      </div>
    `;

    fileList.appendChild(card);
  });
}

searchInput.addEventListener('input', renderFiles);
categoryFilter.addEventListener('change', renderFiles);

renderFiles();
