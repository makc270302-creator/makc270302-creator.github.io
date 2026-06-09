const CONFIG = {
  owner: 'makc270302-creator',
  repo: 'makc270302-creator.github.io',
  branch: 'main',
  documentsPath: 'documents.json',
  changelogPath: 'changelog.json',
  filesFolder: 'files'
};

// Простая блокировка интерфейса. Настоящую защиту даёт GitHub token.
const ADMIN_PASSWORD = 'admin123';

const loginPanel = document.getElementById('loginPanel');
const uploadPanel = document.getElementById('uploadPanel');
const managePanel = document.getElementById('managePanel');
const editPanel = document.getElementById('editPanel');

const adminPassword = document.getElementById('adminPassword');
const loginButton = document.getElementById('loginButton');
const githubToken = document.getElementById('githubToken');

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

const editOriginalPath = document.getElementById('editOriginalPath');
const editTitle = document.getElementById('editTitle');
const editDescription = document.getElementById('editDescription');
const editCategory = document.getElementById('editCategory');
const editAuthor = document.getElementById('editAuthor');
const editUploadDate = document.getElementById('editUploadDate');
const editUpdatedDate = document.getElementById('editUpdatedDate');
const editVersion = document.getElementById('editVersion');
const editPopular = document.getElementById('editPopular');
const saveEditButton = document.getElementById('saveEditButton');
const cancelEditButton = document.getElementById('cancelEditButton');

let cachedDocuments = [];
let cachedDocumentsSha = null;
let cachedChangelog = [];
let cachedChangelogSha = null;
let isAuthenticated = false;

function requireAuth() {
  if (!isAuthenticated) {
    throw new Error('Сначала войдите по паролю администратора.');
  }
}

function lockAdminPanels() {
  loginPanel.hidden = false;
  uploadPanel.hidden = true;
  managePanel.hidden = true;
  editPanel.hidden = true;
}

lockAdminPanels();

function todayRu() {
  return new Date().toLocaleDateString('ru-RU');
}

docDate.value = todayRu();

function showStatus(element, message, type = 'info') {
  element.hidden = false;
  element.className = `status-box status-box--${type}`;
  element.innerHTML = message;
}

function hideStatus(element) {
  element.hidden = true;
  element.innerHTML = '';
}

function requireToken() {
  const token = githubToken.value.trim();
  if (!token) throw new Error('Введите GitHub token.');
  return token;
}

function sanitizeFileName(name) {
  return name
    .trim()
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 120);
}

function textToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary);
}

function base64ToText(base64) {
  const binary = atob(base64.replace(/\n/g, ''));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function githubHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

function apiUrl(path) {
  return `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`;
}

async function getFileFromGitHub(path, token) {
  const response = await fetch(`${apiUrl(path)}?ref=${CONFIG.branch}`, {
    headers: githubHeaders(token)
  });

  if (response.status === 404) return null;

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Ошибка GitHub API: ${response.status}`);
  }

  return response.json();
}

async function putFileToGitHub(path, contentBase64, message, token, sha = null) {
  const body = {
    message,
    content: contentBase64,
    branch: CONFIG.branch
  };

  if (sha) body.sha = sha;

  const response = await fetch(apiUrl(path), {
    method: 'PUT',
    headers: {
      ...githubHeaders(token),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Ошибка загрузки файла: ${response.status}`);
  }

  return response.json();
}

async function deleteFileFromGitHub(path, message, token, sha) {
  const response = await fetch(apiUrl(path), {
    method: 'DELETE',
    headers: {
      ...githubHeaders(token),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ message, sha, branch: CONFIG.branch })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Ошибка удаления файла: ${response.status}`);
  }

  return response.json();
}

async function loadDocumentsFromGitHub(token) {
  const file = await getFileFromGitHub(CONFIG.documentsPath, token);
  if (!file) return { documents: [], sha: null };
  return { documents: JSON.parse(base64ToText(file.content)), sha: file.sha };
}

async function loadChangelogFromGitHub(token) {
  const file = await getFileFromGitHub(CONFIG.changelogPath, token);
  if (!file) return { changelog: [], sha: null };
  return { changelog: JSON.parse(base64ToText(file.content)), sha: file.sha };
}

function sortDocuments(documents) {
  return [...documents].sort((a, b) =>
    a.title.localeCompare(b.title, 'ru', { sensitivity: 'base' })
  );
}

async function saveDocuments(documents, token, commitMessage) {
  const sortedDocuments = sortDocuments(documents);
  const result = await putFileToGitHub(
    CONFIG.documentsPath,
    textToBase64(JSON.stringify(sortedDocuments, null, 2)),
    commitMessage,
    token,
    cachedDocumentsSha
  );
  cachedDocuments = sortedDocuments;
  cachedDocumentsSha = result.content.sha;
  return sortedDocuments;
}

async function addChangelogEntry(entry, token) {
  if (!cachedChangelog.length && cachedChangelogSha === null) {
    const loaded = await loadChangelogFromGitHub(token);
    cachedChangelog = loaded.changelog;
    cachedChangelogSha = loaded.sha;
  }

  const updatedChangelog = [entry, ...cachedChangelog].slice(0, 30);
  const result = await putFileToGitHub(
    CONFIG.changelogPath,
    textToBase64(JSON.stringify(updatedChangelog, null, 2)),
    `Обновлена история изменений: ${entry.title}`,
    token,
    cachedChangelogSha
  );

  cachedChangelog = updatedChangelog;
  cachedChangelogSha = result.content.sha;
}

function validateUploadForm() {
  if (!githubToken.value.trim()) return 'Введите GitHub token.';
  if (!docTitle.value.trim()) return 'Введите название документа.';
  if (!docDescription.value.trim()) return 'Введите описание документа.';
  if (!docCategory.value.trim()) return 'Введите категорию.';
  if (!docAuthor.value.trim()) return 'Введите автора.';
  if (!docDate.value.trim()) return 'Введите дату загрузки.';
  if (!docVersion.value.trim()) return 'Введите версию документа.';
  if (!pdfFile.files[0]) return 'Выберите PDF-файл.';
  if (pdfFile.files[0].type !== 'application/pdf' && !pdfFile.files[0].name.toLowerCase().endsWith('.pdf')) {
    return 'Можно загружать только PDF-файлы.';
  }
  return null;
}

function validateEditForm() {
  if (!editTitle.value.trim()) return 'Введите название документа.';
  if (!editDescription.value.trim()) return 'Введите описание документа.';
  if (!editCategory.value.trim()) return 'Введите категорию.';
  if (!editAuthor.value.trim()) return 'Введите автора.';
  if (!editUploadDate.value.trim()) return 'Введите дату загрузки.';
  if (!editUpdatedDate.value.trim()) return 'Введите дату обновления.';
  if (!editVersion.value.trim()) return 'Введите версию документа.';
  return null;
}

function renderManageList() {
  manageList.innerHTML = '';

  if (!cachedDocuments.length) {
    manageList.innerHTML = '<p class="muted-text">Документы не найдены.</p>';
    return;
  }


  for (const documentItem of sortDocuments(cachedDocuments)) {
    const item = document.createElement('article');
    item.className = 'manage-item';
    item.innerHTML = `
      <div>
        <strong>${documentItem.title}</strong>
        <p>${documentItem.description}</p>
        <small>${documentItem.category} · версия ${documentItem.version || '1.0'} · ${documentItem.updatedDate || documentItem.uploadDate || ''}</small>
      </div>
      <div class="manage-actions">
        <button type="button" data-action="edit" data-path="${documentItem.path}">Редактировать</button>
        <button type="button" class="danger-button" data-action="delete" data-path="${documentItem.path}">Удалить</button>
      </div>
    `;
    manageList.appendChild(item);
  }
}

async function refreshDocumentsList() {
  const token = requireToken();
  showStatus(manageStatusBox, '⏳ Загружаю список документов...', 'info');
  const loaded = await loadDocumentsFromGitHub(token);
  cachedDocuments = sortDocuments(loaded.documents);
  cachedDocumentsSha = loaded.sha;
  renderManageList();
  showStatus(manageStatusBox, `✅ Список загружен. Документов: ${cachedDocuments.length}`, 'success');
}

function fillEditForm(documentItem) {
  editOriginalPath.value = documentItem.path;
  editTitle.value = documentItem.title || '';
  editDescription.value = documentItem.description || '';
  editCategory.value = documentItem.category || '';
  editAuthor.value = documentItem.author || 'Менеджер по стандартизации Ромашов М.С.';
  editUploadDate.value = documentItem.uploadDate || todayRu();
  editUpdatedDate.value = todayRu();
  editVersion.value = documentItem.version || '1.0';
  editPopular.checked = Boolean(documentItem.popular);
  editPanel.hidden = false;
  editPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

loginButton.addEventListener('click', () => {
  if (adminPassword.value !== ADMIN_PASSWORD) {
    alert('Неверный пароль');
    return;
  }

  isAuthenticated = true;
  loginPanel.hidden = true;
  uploadPanel.hidden = false;
  managePanel.hidden = false;
});

uploadButton.addEventListener('click', async () => {
  try { requireAuth(); } catch (error) { showStatus(statusBox, `⚠️ ${error.message}`, 'error'); return; }
  const validationError = validateUploadForm();
  if (validationError) {
    showStatus(statusBox, `⚠️ ${validationError}`, 'error');
    return;
  }

  const token = githubToken.value.trim();
  const title = docTitle.value.trim();
  const fileName = `${sanitizeFileName(title)}.pdf`;
  const pdfPath = `${CONFIG.filesFolder}/${fileName}`;

  uploadButton.disabled = true;
  showStatus(statusBox, '⏳ Загружаю PDF в репозиторий...', 'info');

  try {
    const pdfContent = await fileToBase64(pdfFile.files[0]);
    const existingPdf = await getFileFromGitHub(pdfPath, token);

    await putFileToGitHub(
      pdfPath,
      pdfContent,
      existingPdf ? `Обновлен PDF: ${title}` : `Добавлен PDF: ${title}`,
      token,
      existingPdf?.sha || null
    );

    showStatus(statusBox, '✅ PDF загружен. Обновляю список документов...', 'info');

    const loaded = await loadDocumentsFromGitHub(token);
    cachedDocuments = loaded.documents;
    cachedDocumentsSha = loaded.sha;

    const newDocument = {
      title,
      description: docDescription.value.trim(),
      category: docCategory.value.trim(),
      author: docAuthor.value.trim(),
      uploadDate: docDate.value.trim(),
      updatedDate: docDate.value.trim(),
      version: docVersion.value.trim(),
      popular: docPopular.checked,
      icon: '',
      path: pdfPath
    };

    const withoutDuplicate = cachedDocuments.filter((document) => document.path !== pdfPath && document.title !== title);
    await saveDocuments([...withoutDuplicate, newDocument], token, `Обновлен список документов: ${title}`);

    await addChangelogEntry({
      date: docDate.value.trim(),
      title: `Добавлен документ: ${title}`,
      description: docDescription.value.trim()
    }, token);

    renderManageList();
    showStatus(statusBox, '🎉 Готово! Документ загружен. На GitHub Pages он появится через 1–3 минуты. Обновите главную страницу через Ctrl + F5.', 'success');

    docTitle.value = '';
    docDescription.value = '';
    pdfFile.value = '';
    docPopular.checked = false;
    docVersion.value = '1.0';
    docDate.value = todayRu();
  } catch (error) {
    showStatus(statusBox, `❌ Ошибка: ${error.message}`, 'error');
  } finally {
    uploadButton.disabled = false;
  }
});

loadDocumentsButton.addEventListener('click', async () => {
  try {
    requireAuth();
    loadDocumentsButton.disabled = true;
    await refreshDocumentsList();
  } catch (error) {
    showStatus(manageStatusBox, `❌ Ошибка: ${error.message}`, 'error');
  } finally {
    loadDocumentsButton.disabled = false;
  }
});

manageList.addEventListener('click', async (event) => {
  try { requireAuth(); } catch (error) { showStatus(manageStatusBox, `⚠️ ${error.message}`, 'error'); return; }
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const path = button.dataset.path;
  const action = button.dataset.action;
  const documentItem = cachedDocuments.find((item) => item.path === path);
  if (!documentItem) return;

  if (action === 'edit') {
    fillEditForm(documentItem);
    return;
  }

  if (action === 'delete') {
    const shouldDeletePdf = confirm(`Удалить карточку «${documentItem.title}»?\n\nOK — удалить карточку и сам PDF-файл.\nОтмена — ничего не удалять.`);
    if (!shouldDeletePdf) return;

    try {
      const token = requireToken();
      button.disabled = true;
      showStatus(manageStatusBox, '⏳ Удаляю документ...', 'info');

      const existingPdf = await getFileFromGitHub(documentItem.path, token);
      if (existingPdf?.sha) {
        await deleteFileFromGitHub(documentItem.path, `Удален PDF: ${documentItem.title}`, token, existingPdf.sha);
      }

      const loaded = await loadDocumentsFromGitHub(token);
      cachedDocuments = loaded.documents;
      cachedDocumentsSha = loaded.sha;
      const updatedDocuments = cachedDocuments.filter((item) => item.path !== documentItem.path);
      await saveDocuments(updatedDocuments, token, `Удалена карточка документа: ${documentItem.title}`);

      await addChangelogEntry({
        date: todayRu(),
        title: `Удален документ: ${documentItem.title}`,
        description: 'Документ удален из базы инструкций.'
      }, token);

      renderManageList();
      editPanel.hidden = true;
      showStatus(manageStatusBox, '✅ Документ удален. Изменения появятся на сайте через 1–3 минуты.', 'success');
    } catch (error) {
      showStatus(manageStatusBox, `❌ Ошибка: ${error.message}`, 'error');
    } finally {
      button.disabled = false;
    }
  }
});

saveEditButton.addEventListener('click', async () => {
  try { requireAuth(); } catch (error) { showStatus(manageStatusBox, `⚠️ ${error.message}`, 'error'); return; }
  const validationError = validateEditForm();
  if (validationError) {
    showStatus(manageStatusBox, `⚠️ ${validationError}`, 'error');
    return;
  }

  try {
    const token = requireToken();
    saveEditButton.disabled = true;
    showStatus(manageStatusBox, '⏳ Сохраняю изменения карточки...', 'info');

    const loaded = await loadDocumentsFromGitHub(token);
    cachedDocuments = loaded.documents;
    cachedDocumentsSha = loaded.sha;

    const originalPath = editOriginalPath.value;
    const existingDocument = cachedDocuments.find((item) => item.path === originalPath);
    if (!existingDocument) throw new Error('Документ не найден в documents.json. Обновите список и попробуйте ещё раз.');

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

    const updatedDocuments = cachedDocuments.map((item) => item.path === originalPath ? updatedDocument : item);
    await saveDocuments(updatedDocuments, token, `Отредактирована карточка: ${updatedDocument.title}`);

    await addChangelogEntry({
      date: editUpdatedDate.value.trim(),
      title: `Обновлена карточка: ${updatedDocument.title}`,
      description: editDescription.value.trim()
    }, token);

    renderManageList();
    editPanel.hidden = true;
    showStatus(manageStatusBox, '✅ Изменения сохранены. На сайте они появятся через 1–3 минуты.', 'success');
  } catch (error) {
    showStatus(manageStatusBox, `❌ Ошибка: ${error.message}`, 'error');
  } finally {
    saveEditButton.disabled = false;
  }
});

cancelEditButton.addEventListener('click', () => {
  editPanel.hidden = true;
  hideStatus(manageStatusBox);
});


adminPassword.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') loginButton.click();
});
