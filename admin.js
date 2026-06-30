import {
  appendTextElement,
  base64ToText,
  fileToBase64,
  getDocumentPath,
  isValidDate,
  normalizeText,
  sanitizeFileName,
  sortDocuments,
  textToBase64,
  todayRu
} from './common.js';

const CONFIG = {
  owner: 'makc270302-creator',
  repo: 'makc270302-creator.github.io',
  branch: 'main',
  documentsPath: 'documents.json',
  changelogPath: 'changelog.json',
  categoriesPath: 'categories.json',
  filesFolder: 'files'
};

const githubToken = document.getElementById('githubToken');
const logoutButton = document.getElementById('logoutButton');
const docTitle = document.getElementById('docTitle');
const docDescription = document.getElementById('docDescription');
const docCategory = document.getElementById('docCategory');
const docAuthor = document.getElementById('docAuthor');
const docDate = document.getElementById('docDate');
const docVersion = document.getElementById('docVersion');
const docPopular = document.getElementById('docPopular');
const pdfFile = document.getElementById('pdfFile');
const uploadButton = document.getElementById('uploadButton');
const statusBox = document.getElementById('statusBox');
const loadDocumentsButton = document.getElementById('loadDocumentsButton');
const manageList = document.getElementById('manageList');
const manageStatusBox = document.getElementById('manageStatusBox');
const manageSearch = document.getElementById('manageSearch');
const manageSearchResult = document.getElementById('manageSearchResult');
const selectAllDocuments = document.getElementById('selectAllDocuments');
const bulkCategory = document.getElementById('bulkCategory');
const applyBulkCategoryButton = document.getElementById('applyBulkCategoryButton');
const bulkArchiveButton = document.getElementById('bulkArchiveButton');
const bulkRestoreButton = document.getElementById('bulkRestoreButton');
const checkDuplicatesButton = document.getElementById('checkDuplicatesButton');
const duplicateStatusBox = document.getElementById('duplicateStatusBox');
const editPanel = document.getElementById('editPanel');
const editOriginalPath = document.getElementById('editOriginalPath');
const editTitle = document.getElementById('editTitle');
const editDescription = document.getElementById('editDescription');
const editCategory = document.getElementById('editCategory');
const editAuthor = document.getElementById('editAuthor');
const editUploadDate = document.getElementById('editUploadDate');
const editUpdatedDate = document.getElementById('editUpdatedDate');
const editVersion = document.getElementById('editVersion');
const editPopular = document.getElementById('editPopular');
const editPdfFile = document.getElementById('editPdfFile');
const saveEditButton = document.getElementById('saveEditButton');
const cancelEditButton = document.getElementById('cancelEditButton');
const editArchived = document.getElementById('editArchived');
const categorySuggestions = document.getElementById('categorySuggestions');
const categoryName = document.getElementById('categoryName');
const categoryIcon = document.getElementById('categoryIcon');
const addCategoryButton = document.getElementById('addCategoryButton');
const categoryList = document.getElementById('categoryList');
const categoryStatusBox = document.getElementById('categoryStatusBox');

let cachedDocuments = [];
let cachedChangelog = [];
let cachedCategories = [];
const selectedDocumentPaths = new Set();

docDate.value = todayRu();

function showStatus(element, message, type = 'info') {
  element.hidden = false;
  element.className = `status-box status-box--${type}`;
  element.textContent = message;
}

function hideStatus(element) {
  element.hidden = true;
  element.textContent = '';
}

function requireToken() {
  const token = githubToken.value.trim();
  if (!token) throw new Error('Введите GitHub token.');
  return token;
}

function githubHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

function repoApi(path) {
  return `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/${path}`;
}

async function githubRequest(path, token, options = {}) {
  const response = await fetch(repoApi(path), {
    ...options,
    headers: {
      ...githubHeaders(token),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Ошибка GitHub API: ${response.status}`);
  }

  return response.status === 204 ? null : response.json();
}

async function getRepositoryFile(path, token) {
  const encodedPath = encodeURIComponent(path).replace(/%2F/g, '/');
  return githubRequest(`contents/${encodedPath}?ref=${CONFIG.branch}`, token);
}

async function loadRepositoryData(token) {
  const [documentsFile, changelogFile, categoriesFile] = await Promise.all([
    getRepositoryFile(CONFIG.documentsPath, token),
    getRepositoryFile(CONFIG.changelogPath, token),
    getRepositoryFile(CONFIG.categoriesPath, token)
  ]);

  const documents = JSON.parse(base64ToText(documentsFile.content));
  for (const documentItem of documents) {
    if (!getDocumentPath(documentItem)) {
      throw new Error(`Недопустимый путь PDF у документа «${documentItem.title || 'Без названия'}».`);
    }
  }

  return {
    documents: sortDocuments(documents),
    changelog: JSON.parse(base64ToText(changelogFile.content)),
    categories: JSON.parse(base64ToText(categoriesFile.content))
  };
}

async function createAtomicCommit(changes, message, token) {
  const branchRef = await githubRequest(`git/ref/heads/${CONFIG.branch}`, token);
  const parentSha = branchRef.object.sha;
  const parentCommit = await githubRequest(`git/commits/${parentSha}`, token);

  const treeEntries = await Promise.all(changes.map(async (change) => {
    if (change.delete) {
      return { path: change.path, mode: '100644', type: 'blob', sha: null };
    }

    const blob = await githubRequest('git/blobs', token, {
      method: 'POST',
      body: JSON.stringify({ content: change.contentBase64, encoding: 'base64' })
    });
    return { path: change.path, mode: '100644', type: 'blob', sha: blob.sha };
  }));

  const tree = await githubRequest('git/trees', token, {
    method: 'POST',
    body: JSON.stringify({ base_tree: parentCommit.tree.sha, tree: treeEntries })
  });
  const commit = await githubRequest('git/commits', token, {
    method: 'POST',
    body: JSON.stringify({ message, tree: tree.sha, parents: [parentSha] })
  });

  await githubRequest(`git/refs/heads/${CONFIG.branch}`, token, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha, force: false })
  });
}

function jsonChange(path, data) {
  return { path, contentBase64: textToBase64(`${JSON.stringify(data, null, 2)}\n`) };
}

function nextChangelog(entry) {
  return [entry, ...cachedChangelog].slice(0, 30);
}

function validatePdf(file) {
  if (!file) return null;
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    return 'Можно загружать только PDF-файлы.';
  }
  if (file.size > 50 * 1024 * 1024) return 'Размер PDF не должен превышать 50 МБ.';
  return null;
}

function validateUploadForm() {
  if (!githubToken.value.trim()) return 'Введите GitHub token.';
  if (!docTitle.value.trim()) return 'Введите название документа.';
  if (!sanitizeFileName(docTitle.value)) return 'Название документа должно содержать допустимые символы.';
  if (!docDescription.value.trim()) return 'Введите описание документа.';
  if (!docCategory.value.trim()) return 'Введите категорию.';
  if (!docAuthor.value.trim()) return 'Введите автора.';
  if (!isValidDate(docDate.value)) return 'Введите дату загрузки в формате ДД.ММ.ГГГГ.';
  if (!docVersion.value.trim()) return 'Введите версию документа.';
  if (!pdfFile.files[0]) return 'Выберите PDF-файл.';
  return validatePdf(pdfFile.files[0]);
}

function validateEditForm() {
  if (!editTitle.value.trim()) return 'Введите название документа.';
  if (!editDescription.value.trim()) return 'Введите описание документа.';
  if (!editCategory.value.trim()) return 'Введите категорию.';
  if (!editAuthor.value.trim()) return 'Введите автора.';
  if (!isValidDate(editUploadDate.value) || !isValidDate(editUpdatedDate.value)) {
    return 'Введите даты в формате ДД.ММ.ГГГГ.';
  }
  if (!editVersion.value.trim()) return 'Введите версию документа.';
  return validatePdf(editPdfFile.files[0]);
}

function getVisibleDocuments() {
  const terms = normalizeText(manageSearch.value).split(/\s+/).filter(Boolean);
  if (!terms.length) return cachedDocuments;

  return cachedDocuments.filter((documentItem) => {
    const searchableText = normalizeText([
      documentItem.title,
      documentItem.description,
      documentItem.category,
      documentItem.author,
      documentItem.path
    ].filter(Boolean).join(' '));
    return terms.every((term) => searchableText.includes(term));
  });
}

function updateVisibleSelectionState(visibleDocuments) {
  const visiblePaths = visibleDocuments.map((item) => item.path);
  const selectedVisibleCount = visiblePaths.filter((path) => selectedDocumentPaths.has(path)).length;
  selectAllDocuments.checked = visiblePaths.length > 0 && selectedVisibleCount === visiblePaths.length;
  selectAllDocuments.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visiblePaths.length;
}

function renderManageList() {
  manageList.replaceChildren();

  if (!cachedDocuments.length) {
    appendTextElement(manageList, 'p', 'Документы не загружены.', 'muted-text');
    manageSearchResult.textContent = '';
    updateVisibleSelectionState([]);
    return;
  }

  const visibleDocuments = getVisibleDocuments();
  const hasSearch = Boolean(manageSearch.value.trim());
  manageSearchResult.textContent = hasSearch
    ? `Найдено: ${visibleDocuments.length} из ${cachedDocuments.length}`
    : `Всего документов: ${cachedDocuments.length}`;
  updateVisibleSelectionState(visibleDocuments);

  if (!visibleDocuments.length) {
    appendTextElement(manageList, 'p', 'По вашему запросу документы не найдены.', 'muted-text');
    return;
  }

  for (const documentItem of visibleDocuments) {
    const item = document.createElement('article');
    item.className = 'manage-item manage-item--document';
    const selection = document.createElement('input');
    selection.type = 'checkbox';
    selection.className = 'manage-select';
    selection.checked = selectedDocumentPaths.has(documentItem.path);
    selection.dataset.selectPath = documentItem.path;
    selection.setAttribute('aria-label', `Выбрать документ: ${documentItem.title}`);
    item.appendChild(selection);
    const content = document.createElement('div');
    appendTextElement(content, 'strong', documentItem.title || 'Без названия');
    appendTextElement(content, 'p', documentItem.description || '');
    appendTextElement(content, 'small', `${documentItem.category} · версия ${documentItem.version} · ${documentItem.updatedDate}`);
    if (documentItem.archived) appendTextElement(content, 'small', 'Архивный документ', 'archive-note');
    item.appendChild(content);

    const actions = document.createElement('div');
    actions.className = 'manage-actions';
    const editButton = appendTextElement(actions, 'button', 'Редактировать');
    editButton.type = 'button';
    editButton.dataset.action = 'edit';
    editButton.dataset.path = documentItem.path;
    const archiveButton = appendTextElement(actions, 'button', documentItem.archived ? 'Вернуть' : 'В архив', 'secondary-button');
    archiveButton.type = 'button';
    archiveButton.dataset.action = 'archive';
    archiveButton.dataset.path = documentItem.path;
    const deleteButton = appendTextElement(actions, 'button', 'Удалить', 'danger-button');
    deleteButton.type = 'button';
    deleteButton.dataset.action = 'delete';
    deleteButton.dataset.path = documentItem.path;
    item.appendChild(actions);
    manageList.appendChild(item);
  }
}

function renderCategories() {
  categorySuggestions.replaceChildren();
  categoryList.replaceChildren();
  bulkCategory.replaceChildren();
  const defaultBulkOption = document.createElement('option');
  defaultBulkOption.value = '';
  defaultBulkOption.textContent = 'Сменить категорию...';
  bulkCategory.appendChild(defaultBulkOption);

  for (const category of cachedCategories) {
    const option = document.createElement('option');
    option.value = category.name;
    categorySuggestions.appendChild(option);
    const bulkOption = option.cloneNode(true);
    bulkCategory.appendChild(bulkOption);

    const item = document.createElement('article');
    item.className = 'manage-item';
    appendTextElement(item, 'strong', `${category.icon || '📑'} ${category.name}`);
    const actions = document.createElement('div');
    actions.className = 'manage-actions';
    const deleteButton = appendTextElement(actions, 'button', 'Удалить', 'danger-button');
    deleteButton.type = 'button';
    deleteButton.dataset.category = category.name;
    item.appendChild(actions);
    categoryList.appendChild(item);
  }
}

async function refreshDocumentsList({ quiet = false } = {}) {
  const token = requireToken();
  if (!quiet) showStatus(manageStatusBox, 'Загружаю список документов...', 'info');
  const loaded = await loadRepositoryData(token);
  cachedDocuments = loaded.documents;
  cachedChangelog = loaded.changelog;
  cachedCategories = loaded.categories;
  selectedDocumentPaths.clear();
  selectAllDocuments.checked = false;
  renderManageList();
  renderCategories();
  showStatus(manageStatusBox, `Список загружен. Документов: ${cachedDocuments.length}`, 'success');
}

function fillEditForm(documentItem) {
  editOriginalPath.value = documentItem.path;
  editTitle.value = documentItem.title || '';
  editDescription.value = documentItem.description || '';
  editCategory.value = documentItem.category || '';
  editAuthor.value = documentItem.author || '';
  editUploadDate.value = documentItem.uploadDate || todayRu();
  editUpdatedDate.value = todayRu();
  editVersion.value = documentItem.version || '1.0';
  editPopular.checked = Boolean(documentItem.popular);
  editArchived.checked = Boolean(documentItem.archived);
  editPdfFile.value = '';
  editPanel.hidden = false;
  editTitle.focus();
  editPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetUploadForm() {
  docTitle.value = '';
  docDescription.value = '';
  pdfFile.value = '';
  docPopular.checked = false;
  docVersion.value = '1.0';
  docDate.value = todayRu();
}

function getDuplicateMessages() {
  const messages = [];
  const titleGroups = new Map();
  const pathGroups = new Map();
  cachedDocuments.forEach((item) => {
    const titleKey = normalizeText(item.title);
    const pathKey = normalizeText(item.path);
    titleGroups.set(titleKey, [...(titleGroups.get(titleKey) || []), item.title]);
    pathGroups.set(pathKey, [...(pathGroups.get(pathKey) || []), item.title]);
  });
  titleGroups.forEach((titles) => {
    if (titles.length > 1) messages.push(`Повторяется название: ${titles.join(', ')}`);
  });
  pathGroups.forEach((titles, path) => {
    if (titles.length > 1) messages.push(`Один PDF используется несколько раз (${path}): ${titles.join(', ')}`);
  });
  return messages;
}

async function applyBulkUpdate({ category = null, archived = null }) {
  if (!selectedDocumentPaths.size) {
    showStatus(manageStatusBox, 'Сначала выберите документы.', 'error');
    return;
  }
  const token = requireToken();
  const loaded = await loadRepositoryData(token);
  cachedDocuments = loaded.documents;
  cachedChangelog = loaded.changelog;
  cachedCategories = loaded.categories;
  const affected = cachedDocuments.filter((item) => selectedDocumentPaths.has(item.path));
  if (!affected.length) throw new Error('Выбранные документы больше не найдены. Обновите список.');
  if (category && !cachedCategories.some((item) => item.name === category)) {
    throw new Error('Выбранная категория больше не существует. Обновите список.');
  }
  const documents = sortDocuments(cachedDocuments.map((item) => {
    if (!selectedDocumentPaths.has(item.path)) return item;
    return {
      ...item,
      ...(category ? { category } : {}),
      ...(archived !== null ? { archived } : {}),
      updatedDate: todayRu()
    };
  }));
  const action = category
    ? `Изменена категория на «${category}»`
    : archived ? 'Архивированы документы' : 'Восстановлены документы';
  const changelog = nextChangelog({
    date: todayRu(),
    title: `${action}: ${affected.length}`,
    description: affected.map((item) => item.title).join(', ')
  });
  await createAtomicCommit([
    jsonChange(CONFIG.documentsPath, documents),
    jsonChange(CONFIG.changelogPath, changelog)
  ], `${action}: ${affected.length}`, token);
  cachedDocuments = documents;
  cachedChangelog = changelog;
  selectedDocumentPaths.clear();
  selectAllDocuments.checked = false;
  renderManageList();
  showStatus(manageStatusBox, `${action}. Обновлено документов: ${affected.length}.`, 'success');
}

githubToken.addEventListener('change', async () => {
  if (!githubToken.value.trim()) return;
  try {
    await refreshDocumentsList({ quiet: true });
  } catch (error) {
    showStatus(manageStatusBox, `Не удалось проверить токен: ${error.message}`, 'error');
  }
});

logoutButton.addEventListener('click', () => {
  githubToken.value = '';
  cachedDocuments = [];
  cachedChangelog = [];
  cachedCategories = [];
  selectedDocumentPaths.clear();
  selectAllDocuments.checked = false;
  editPanel.hidden = true;
  renderManageList();
  renderCategories();
  hideStatus(statusBox);
  showStatus(manageStatusBox, 'Токен очищен из текущей вкладки.', 'info');
  githubToken.focus();
});

loadDocumentsButton.addEventListener('click', async () => {
  loadDocumentsButton.disabled = true;
  try {
    await refreshDocumentsList();
  } catch (error) {
    showStatus(manageStatusBox, `Ошибка: ${error.message}`, 'error');
  } finally {
    loadDocumentsButton.disabled = false;
  }
});

manageList.addEventListener('change', (event) => {
  const checkbox = event.target.closest('input[data-select-path]');
  if (!checkbox) return;
  if (checkbox.checked) selectedDocumentPaths.add(checkbox.dataset.selectPath);
  else selectedDocumentPaths.delete(checkbox.dataset.selectPath);
  updateVisibleSelectionState(getVisibleDocuments());
});

selectAllDocuments.addEventListener('change', () => {
  const visibleDocuments = getVisibleDocuments();
  visibleDocuments.forEach((item) => {
    if (selectAllDocuments.checked) selectedDocumentPaths.add(item.path);
    else selectedDocumentPaths.delete(item.path);
  });
  renderManageList();
});

manageSearch.addEventListener('input', renderManageList);

applyBulkCategoryButton.addEventListener('click', async () => {
  if (!bulkCategory.value) return showStatus(manageStatusBox, 'Выберите категорию.', 'error');
  try {
    await applyBulkUpdate({ category: bulkCategory.value });
  } catch (error) {
    showStatus(manageStatusBox, `Ошибка: ${error.message}`, 'error');
  }
});

bulkArchiveButton.addEventListener('click', async () => {
  try { await applyBulkUpdate({ archived: true }); } catch (error) { showStatus(manageStatusBox, `Ошибка: ${error.message}`, 'error'); }
});

bulkRestoreButton.addEventListener('click', async () => {
  try { await applyBulkUpdate({ archived: false }); } catch (error) { showStatus(manageStatusBox, `Ошибка: ${error.message}`, 'error'); }
});

checkDuplicatesButton.addEventListener('click', () => {
  if (!cachedDocuments.length) {
    showStatus(duplicateStatusBox, 'Сначала загрузите список документов.', 'error');
    return;
  }
  const messages = getDuplicateMessages();
  showStatus(
    duplicateStatusBox,
    messages.length ? messages.join('\n') : 'Дубликаты названий и PDF-путей не найдены.',
    messages.length ? 'error' : 'success'
  );
});

uploadButton.addEventListener('click', async () => {
  const validationError = validateUploadForm();
  if (validationError) {
    showStatus(statusBox, validationError, 'error');
    return;
  }

  const token = requireToken();
  uploadButton.disabled = true;
  showStatus(statusBox, 'Создаю единый коммит с PDF, карточкой и историей...', 'info');

  try {
    const loaded = await loadRepositoryData(token);
    cachedDocuments = loaded.documents;
    cachedChangelog = loaded.changelog;
    cachedCategories = loaded.categories;

    const title = docTitle.value.trim();
    if (!cachedCategories.some((category) => category.name === docCategory.value.trim())) {
      throw new Error('Выберите существующую категорию или сначала добавьте новую.');
    }
    const path = `${CONFIG.filesFolder}/${sanitizeFileName(title)}.pdf`;
    const duplicate = cachedDocuments.find((item) =>
      normalizeText(item.title) === normalizeText(title) || item.path === path
    );
    if (duplicate && !confirm(`Документ «${duplicate.title}» уже существует. Заменить его?`)) {
      showStatus(statusBox, 'Загрузка отменена. Существующий документ не изменён.', 'info');
      return;
    }

    const documentItem = {
      title,
      description: docDescription.value.trim(),
      category: docCategory.value.trim(),
      author: docAuthor.value.trim(),
      uploadDate: duplicate?.uploadDate || docDate.value.trim(),
      updatedDate: docDate.value.trim(),
      version: docVersion.value.trim(),
      popular: docPopular.checked,
      archived: false,
      icon: '',
      path
    };
    const documents = sortDocuments([
      ...cachedDocuments.filter((item) => item.path !== duplicate?.path && normalizeText(item.title) !== normalizeText(title)),
      documentItem
    ]);
    const changelog = nextChangelog({
      date: docDate.value.trim(),
      title: `${duplicate ? 'Обновлён' : 'Добавлен'} документ: ${title}`,
      description: docDescription.value.trim()
    });
    const pdfContent = await fileToBase64(pdfFile.files[0]);
    const changes = [
      { path, contentBase64: pdfContent },
      jsonChange(CONFIG.documentsPath, documents),
      jsonChange(CONFIG.changelogPath, changelog)
    ];
    if (duplicate?.path && duplicate.path !== path) changes.push({ path: duplicate.path, delete: true });

    await createAtomicCommit(changes, `${duplicate ? 'Обновлён' : 'Добавлен'} документ: ${title}`, token);
    cachedDocuments = documents;
    cachedChangelog = changelog;
    renderManageList();
    resetUploadForm();
    showStatus(statusBox, 'Готово. PDF, карточка и история сохранены одним коммитом.', 'success');
  } catch (error) {
    showStatus(statusBox, `Ошибка: ${error.message}`, 'error');
  } finally {
    uploadButton.disabled = false;
  }
});

manageList.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const documentItem = cachedDocuments.find((item) => item.path === button.dataset.path);
  if (!documentItem) return;

  if (button.dataset.action === 'edit') {
    fillEditForm(documentItem);
    return;
  }

  if (button.dataset.action === 'archive') {
    button.disabled = true;
    try {
      const token = requireToken();
      const loaded = await loadRepositoryData(token);
      cachedDocuments = loaded.documents;
      cachedChangelog = loaded.changelog;
      cachedCategories = loaded.categories;
      const latestDocument = cachedDocuments.find((item) => item.path === documentItem.path);
      if (!latestDocument) throw new Error('Документ не найден. Обновите список и попробуйте снова.');
      const archived = !Boolean(latestDocument.archived);
      const documents = sortDocuments(cachedDocuments.map((item) =>
        item.path === documentItem.path ? { ...item, archived, updatedDate: todayRu() } : item
      ));
      const changelog = nextChangelog({
        date: todayRu(),
        title: `${archived ? 'Архивирован' : 'Возвращён из архива'} документ: ${documentItem.title}`,
        description: documentItem.description
      });
      await createAtomicCommit([
        jsonChange(CONFIG.documentsPath, documents),
        jsonChange(CONFIG.changelogPath, changelog)
      ], `${archived ? 'Архивирован' : 'Восстановлен'} документ: ${documentItem.title}`, token);
      cachedDocuments = documents;
      cachedChangelog = changelog;
      renderManageList();
      showStatus(manageStatusBox, archived ? 'Документ перемещён в архив.' : 'Документ возвращён из архива.', 'success');
    } catch (error) {
      showStatus(manageStatusBox, `Ошибка: ${error.message}`, 'error');
    } finally {
      button.disabled = false;
    }
    return;
  }

  if (!confirm(`Удалить документ «${documentItem.title}» и его PDF?`)) return;

  button.disabled = true;
  try {
    const token = requireToken();
    const loaded = await loadRepositoryData(token);
    cachedDocuments = loaded.documents;
    cachedChangelog = loaded.changelog;
    cachedCategories = loaded.categories;
    const documents = cachedDocuments.filter((item) => item.path !== documentItem.path);
    const changelog = nextChangelog({
      date: todayRu(),
      title: `Удалён документ: ${documentItem.title}`,
      description: 'Документ удалён из базы инструкций.'
    });

    await createAtomicCommit([
      { path: documentItem.path, delete: true },
      jsonChange(CONFIG.documentsPath, documents),
      jsonChange(CONFIG.changelogPath, changelog)
    ], `Удалён документ: ${documentItem.title}`, token);

    cachedDocuments = documents;
    cachedChangelog = changelog;
    renderManageList();
    editPanel.hidden = true;
    showStatus(manageStatusBox, 'Документ и PDF удалены одним коммитом.', 'success');
  } catch (error) {
    showStatus(manageStatusBox, `Ошибка: ${error.message}`, 'error');
  } finally {
    button.disabled = false;
  }
});

saveEditButton.addEventListener('click', async () => {
  const validationError = validateEditForm();
  if (validationError) {
    showStatus(manageStatusBox, validationError, 'error');
    return;
  }

  saveEditButton.disabled = true;
  try {
    const token = requireToken();
    const loaded = await loadRepositoryData(token);
    cachedDocuments = loaded.documents;
    cachedChangelog = loaded.changelog;
    cachedCategories = loaded.categories;

    const originalPath = editOriginalPath.value;
    if (!cachedCategories.some((category) => category.name === editCategory.value.trim())) {
      throw new Error('Выберите существующую категорию или сначала добавьте новую.');
    }
    const existingDocument = cachedDocuments.find((item) => item.path === originalPath);
    if (!existingDocument) throw new Error('Документ не найден. Обновите список и попробуйте снова.');

    const duplicate = cachedDocuments.find((item) =>
      item.path !== originalPath && normalizeText(item.title) === normalizeText(editTitle.value)
    );
    if (duplicate) throw new Error(`Название уже используется документом «${duplicate.title}».`);

    const updatedDocument = {
      ...existingDocument,
      title: editTitle.value.trim(),
      description: editDescription.value.trim(),
      category: editCategory.value.trim(),
      author: editAuthor.value.trim(),
      uploadDate: editUploadDate.value.trim(),
      updatedDate: editUpdatedDate.value.trim(),
      version: editVersion.value.trim(),
      popular: editPopular.checked,
      archived: editArchived.checked
    };
    const documents = sortDocuments(cachedDocuments.map((item) =>
      item.path === originalPath ? updatedDocument : item
    ));
    const changelog = nextChangelog({
      date: editUpdatedDate.value.trim(),
      title: `Обновлена карточка: ${updatedDocument.title}`,
      description: updatedDocument.description
    });
    const changes = [
      jsonChange(CONFIG.documentsPath, documents),
      jsonChange(CONFIG.changelogPath, changelog)
    ];
    if (editPdfFile.files[0]) {
      changes.push({ path: originalPath, contentBase64: await fileToBase64(editPdfFile.files[0]) });
    }

    await createAtomicCommit(changes, `Обновлён документ: ${updatedDocument.title}`, token);
    cachedDocuments = documents;
    cachedChangelog = changelog;
    renderManageList();
    editPanel.hidden = true;
    showStatus(manageStatusBox, 'Изменения сохранены одним коммитом.', 'success');
  } catch (error) {
    showStatus(manageStatusBox, `Ошибка: ${error.message}`, 'error');
  } finally {
    saveEditButton.disabled = false;
  }
});

cancelEditButton.addEventListener('click', () => {
  editPanel.hidden = true;
  editPdfFile.value = '';
  hideStatus(manageStatusBox);
});

renderManageList();
renderCategories();

addCategoryButton.addEventListener('click', async () => {
  const name = categoryName.value.trim();
  const icon = categoryIcon.value.trim() || '📑';
  if (!name) {
    showStatus(categoryStatusBox, 'Введите название категории.', 'error');
    return;
  }
  if (cachedCategories.some((category) => normalizeText(category.name) === normalizeText(name))) {
    showStatus(categoryStatusBox, 'Такая категория уже существует.', 'error');
    return;
  }

  addCategoryButton.disabled = true;
  try {
    const token = requireToken();
    const loaded = await loadRepositoryData(token);
    cachedDocuments = loaded.documents;
    cachedChangelog = loaded.changelog;
    cachedCategories = loaded.categories;
    if (cachedCategories.some((category) => normalizeText(category.name) === normalizeText(name))) {
      throw new Error('Такая категория уже существует.');
    }
    const categories = [...cachedCategories, { name, icon }]
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    const changelog = nextChangelog({
      date: todayRu(),
      title: `Добавлена категория: ${name}`,
      description: `Категория «${name}» добавлена в портал.`
    });
    await createAtomicCommit([
      jsonChange(CONFIG.categoriesPath, categories),
      jsonChange(CONFIG.changelogPath, changelog)
    ], `Добавлена категория: ${name}`, token);
    cachedCategories = categories;
    cachedChangelog = changelog;
    renderCategories();
    categoryName.value = '';
    categoryIcon.value = '';
    showStatus(categoryStatusBox, 'Категория добавлена.', 'success');
  } catch (error) {
    showStatus(categoryStatusBox, `Ошибка: ${error.message}`, 'error');
  } finally {
    addCategoryButton.disabled = false;
  }
});

categoryList.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-category]');
  if (!button) return;
  const name = button.dataset.category;
  if (cachedDocuments.some((documentItem) => documentItem.category === name)) {
    showStatus(categoryStatusBox, 'Нельзя удалить категорию, пока она используется документами.', 'error');
    return;
  }
  if (!confirm(`Удалить категорию «${name}»?`)) return;

  button.disabled = true;
  try {
    const token = requireToken();
    const loaded = await loadRepositoryData(token);
    cachedDocuments = loaded.documents;
    cachedChangelog = loaded.changelog;
    cachedCategories = loaded.categories;
    if (cachedDocuments.some((documentItem) => documentItem.category === name)) {
      throw new Error('Категория уже используется документом.');
    }
    const categories = cachedCategories.filter((category) => category.name !== name);
    const changelog = nextChangelog({
      date: todayRu(),
      title: `Удалена категория: ${name}`,
      description: `Неиспользуемая категория «${name}» удалена из портала.`
    });
    await createAtomicCommit([
      jsonChange(CONFIG.categoriesPath, categories),
      jsonChange(CONFIG.changelogPath, changelog)
    ], `Удалена категория: ${name}`, token);
    cachedCategories = categories;
    cachedChangelog = changelog;
    renderCategories();
    showStatus(categoryStatusBox, 'Категория удалена.', 'success');
  } catch (error) {
    showStatus(categoryStatusBox, `Ошибка: ${error.message}`, 'error');
  } finally {
    button.disabled = false;
  }
});
