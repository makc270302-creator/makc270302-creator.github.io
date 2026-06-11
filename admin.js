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

let cachedDocuments = [];
let cachedChangelog = [];

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
  const [documentsFile, changelogFile] = await Promise.all([
    getRepositoryFile(CONFIG.documentsPath, token),
    getRepositoryFile(CONFIG.changelogPath, token)
  ]);

  const documents = JSON.parse(base64ToText(documentsFile.content));
  for (const documentItem of documents) {
    if (!getDocumentPath(documentItem)) {
      throw new Error(`Недопустимый путь PDF у документа «${documentItem.title || 'Без названия'}».`);
    }
  }

  return {
    documents: sortDocuments(documents),
    changelog: JSON.parse(base64ToText(changelogFile.content))
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

function renderManageList() {
  manageList.replaceChildren();

  if (!cachedDocuments.length) {
    appendTextElement(manageList, 'p', 'Документы не загружены.', 'muted-text');
    return;
  }

  for (const documentItem of cachedDocuments) {
    const item = document.createElement('article');
    item.className = 'manage-item';
    const content = document.createElement('div');
    appendTextElement(content, 'strong', documentItem.title || 'Без названия');
    appendTextElement(content, 'p', documentItem.description || '');
    appendTextElement(content, 'small', `${documentItem.category} · версия ${documentItem.version} · ${documentItem.updatedDate}`);
    item.appendChild(content);

    const actions = document.createElement('div');
    actions.className = 'manage-actions';
    const editButton = appendTextElement(actions, 'button', 'Редактировать');
    editButton.type = 'button';
    editButton.dataset.action = 'edit';
    editButton.dataset.path = documentItem.path;
    const deleteButton = appendTextElement(actions, 'button', 'Удалить', 'danger-button');
    deleteButton.type = 'button';
    deleteButton.dataset.action = 'delete';
    deleteButton.dataset.path = documentItem.path;
    item.appendChild(actions);
    manageList.appendChild(item);
  }
}

async function refreshDocumentsList({ quiet = false } = {}) {
  const token = requireToken();
  if (!quiet) showStatus(manageStatusBox, 'Загружаю список документов...', 'info');
  const loaded = await loadRepositoryData(token);
  cachedDocuments = loaded.documents;
  cachedChangelog = loaded.changelog;
  renderManageList();
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
  editPanel.hidden = true;
  renderManageList();
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

    const title = docTitle.value.trim();
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

  if (!confirm(`Удалить документ «${documentItem.title}» и его PDF?`)) return;

  button.disabled = true;
  try {
    const token = requireToken();
    const loaded = await loadRepositoryData(token);
    cachedDocuments = loaded.documents;
    cachedChangelog = loaded.changelog;
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

    const originalPath = editOriginalPath.value;
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
      popular: editPopular.checked
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
