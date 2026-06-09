const CONFIG = {
  owner: 'makc270302-creator',
  repo: 'makc270302-creator.github.io',
  branch: 'main',
  documentsPath: 'documents.json',
  filesFolder: 'files'
};

// Это не настоящая защита, а простая блокировка интерфейса.
// Настоящую защиту даёт GitHub token с правом записи в репозиторий.
const ADMIN_PASSWORD = '147963';

const loginPanel = document.getElementById('loginPanel');
const uploadPanel = document.getElementById('uploadPanel');
const adminPassword = document.getElementById('adminPassword');
const loginButton = document.getElementById('loginButton');
const githubToken = document.getElementById('githubToken');
const docTitle = document.getElementById('docTitle');
const docDescription = document.getElementById('docDescription');
const docCategory = document.getElementById('docCategory');
const docAuthor = document.getElementById('docAuthor');
const docDate = document.getElementById('docDate');
const pdfFile = document.getElementById('pdfFile');
const uploadButton = document.getElementById('uploadButton');
const statusBox = document.getElementById('statusBox');

function todayRu() {
  return new Date().toLocaleDateString('ru-RU');
}

docDate.value = todayRu();

function showStatus(message, type = 'info') {
  statusBox.hidden = false;
  statusBox.className = `status-box status-box--${type}`;
  statusBox.innerHTML = message;
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

async function loadDocumentsFromGitHub(token) {
  const file = await getFileFromGitHub(CONFIG.documentsPath, token);

  if (!file) return { documents: [], sha: null };

  return {
    documents: JSON.parse(base64ToText(file.content)),
    sha: file.sha
  };
}

function validateForm() {
  if (!githubToken.value.trim()) return 'Введите GitHub token.';
  if (!docTitle.value.trim()) return 'Введите название документа.';
  if (!docDescription.value.trim()) return 'Введите описание документа.';
  if (!docCategory.value.trim()) return 'Введите категорию.';
  if (!docAuthor.value.trim()) return 'Введите автора.';
  if (!docDate.value.trim()) return 'Введите дату загрузки.';
  if (!pdfFile.files[0]) return 'Выберите PDF-файл.';
  if (pdfFile.files[0].type !== 'application/pdf' && !pdfFile.files[0].name.toLowerCase().endsWith('.pdf')) {
    return 'Можно загружать только PDF-файлы.';
  }
  return null;
}

loginButton.addEventListener('click', () => {
  if (adminPassword.value !== ADMIN_PASSWORD) {
    alert('Неверный пароль');
    return;
  }

  loginPanel.hidden = true;
  uploadPanel.hidden = false;
});

uploadButton.addEventListener('click', async () => {
  const validationError = validateForm();
  if (validationError) {
    showStatus(`⚠️ ${validationError}`, 'error');
    return;
  }

  const token = githubToken.value.trim();
  const title = docTitle.value.trim();
  const fileName = `${sanitizeFileName(title)}.pdf`;
  const pdfPath = `${CONFIG.filesFolder}/${fileName}`;

  uploadButton.disabled = true;
  showStatus('⏳ Загружаю PDF в репозиторий...', 'info');

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

    showStatus('✅ PDF загружен. Обновляю список документов...', 'info');

    const { documents, sha } = await loadDocumentsFromGitHub(token);

    const newDocument = {
      title,
      description: docDescription.value.trim(),
      category: docCategory.value.trim(),
      author: docAuthor.value.trim(),
      uploadDate: docDate.value.trim(),
      path: pdfPath
    };

    const withoutDuplicate = documents.filter((document) => document.path !== pdfPath && document.title !== title);
    const updatedDocuments = [...withoutDuplicate, newDocument].sort((a, b) =>
      a.title.localeCompare(b.title, 'ru', { sensitivity: 'base' })
    );

    await putFileToGitHub(
      CONFIG.documentsPath,
      textToBase64(JSON.stringify(updatedDocuments, null, 2)),
      `Обновлен список документов: ${title}`,
      token,
      sha
    );

    showStatus('🎉 Готово! Документ загружен. На GitHub Pages он появится после обновления сайта через 1–3 минуты. Обновите главную страницу через Ctrl + F5.', 'success');

    docTitle.value = '';
    docDescription.value = '';
    pdfFile.value = '';
    docDate.value = todayRu();
  } catch (error) {
    showStatus(`❌ Ошибка: ${error.message}`, 'error');
  } finally {
    uploadButton.disabled = false;
  }
});
