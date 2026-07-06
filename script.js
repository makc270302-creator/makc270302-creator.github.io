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
const FAVORITES_KEY = 'pdf-portal-favorites';
const VIEW_KEY = 'pdf-portal-view';
const FILTERS_KEY = 'pdf-portal-filters';
const RECENT_KEY = 'pdf-portal-recent';
const VIEWS_KEY = 'pdf-portal-document-views';
const AUTH_LOGIN_KEY = 'pdf-portal-login';
const AUTH_SESSION_KEY = 'pdf-portal-auth-session';
const FILES_PAGE_SIZE = 12;
const CHANGELOG_PAGE_SIZE = 10;
let authEndpoint = '';
let aiProxyEndpoint = '';
let authMode = 'login';
let favorites = new Set(readStoredArray(FAVORITES_KEY));
let recentPaths = readStoredArray(RECENT_KEY);
let documentViews = readStoredObject(VIEWS_KEY);
let viewMode = readStoredValue(VIEW_KEY) === 'compact' ? 'compact' : 'cards';
const storedFilters = readStoredObject(FILTERS_KEY);
let visibleFilesCount = FILES_PAGE_SIZE;
let visibleChangelogCount = CHANGELOG_PAGE_SIZE;
let aiEndpoint = '';

const authForm = document.getElementById('authForm');
const authTitle = document.getElementById('authTitle');
const loginModeButton = document.getElementById('loginModeButton');
const registerModeButton = document.getElementById('registerModeButton');
const loginInput = document.getElementById('loginInput');
const passwordInput = document.getElementById('passwordInput');
const confirmPasswordField = document.getElementById('confirmPasswordField');
const confirmPasswordInput = document.getElementById('confirmPasswordInput');
const authMessage = document.getElementById('authMessage');
const authSubmit = document.getElementById('authSubmit');
const fileList = document.getElementById('fileList');
const popularList = document.getElementById('popularList');
const popularSection = document.getElementById('popularSection');
const searchInput = document.getElementById('searchInput');
const categoryFilter = document.getElementById('categoryFilter');
const sortFilter = document.getElementById('sortFilter');
const showArchived = document.getElementById('showArchived');
const documentsSummary = document.getElementById('documentsSummary');
const showFavorites = document.getElementById('showFavorites');
const resetFiltersButton = document.getElementById('resetFiltersButton');
const exportCsvButton = document.getElementById('exportCsvButton');
const activeFilters = document.getElementById('activeFilters');
const cardViewButton = document.getElementById('cardViewButton');
const compactViewButton = document.getElementById('compactViewButton');
const filesCount = document.getElementById('filesCount');
const categoriesCount = document.getElementById('categoriesCount');
const latestUpdate = document.getElementById('latestUpdate');
const emptyState = document.getElementById('emptyState');
const showMoreFilesButton = document.getElementById('showMoreFilesButton');
const changelogList = document.getElementById('changelogList');
const showMoreChangelogButton = document.getElementById('showMoreChangelogButton');
const recentSection = document.getElementById('recentSection');
const recentList = document.getElementById('recentList');
const clearRecentButton = document.getElementById('clearRecentButton');
const portalVersion = document.getElementById('portalVersion');
const pdfViewer = document.getElementById('pdfViewer');
const viewerTitle = document.getElementById('viewerTitle');
const viewerHint = document.getElementById('viewerHint');
const viewerActions = document.getElementById('viewerActions');
const viewerOpen = document.getElementById('viewerOpen');
const viewerDownload = document.getElementById('viewerDownload');
const viewerCopyLink = document.getElementById('viewerCopyLink');
const closeViewer = document.getElementById('closeViewer');
const viewerStatus = document.getElementById('viewerStatus');
const relatedSection = document.getElementById('relatedSection');
const relatedList = document.getElementById('relatedList');
const aiForm = document.getElementById('aiForm');
const aiQuestion = document.getElementById('aiQuestion');
const aiSubmitButton = document.getElementById('aiSubmitButton');
const aiClearButton = document.getElementById('aiClearButton');
const aiStatus = document.getElementById('aiStatus');
const aiAnswer = document.getElementById('aiAnswer');
const aiAnswerText = document.getElementById('aiAnswerText');
const aiSourcesSection = document.getElementById('aiSourcesSection');
const aiSourcesList = document.getElementById('aiSourcesList');
let viewerLoadTimer = null;
let currentViewerFile = null;

function readStoredArray(key) {
  try {
    const value = JSON.parse(readStoredValue(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function readStoredObject(key) {
  try {
    const value = JSON.parse(readStoredValue(key) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function readStoredValue(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storeFilters() {
  storeValue(FILTERS_KEY, JSON.stringify({
    search: searchInput.value,
    category: categoryFilter.value,
    sort: sortFilter.value,
    showArchived: showArchived.checked,
    showFavorites: showFavorites.checked
  }));
}

function applyStoredFilters() {
  searchInput.value = typeof storedFilters.search === 'string' ? storedFilters.search : '';
  if ([...categoryFilter.options].some((option) => option.value === storedFilters.category)) {
    categoryFilter.value = storedFilters.category;
  }
  if ([...sortFilter.options].some((option) => option.value === storedFilters.sort)) {
    sortFilter.value = storedFilters.sort;
  }
  showArchived.checked = storedFilters.showArchived === true;
  showFavorites.checked = storedFilters.showFavorites === true;
}

function hasActiveFilters() {
  return Boolean(searchInput.value.trim())
    || categoryFilter.value !== 'Все категории'
    || sortFilter.value !== 'title-asc'
    || showArchived.checked
    || showFavorites.checked;
}

function updateResetFiltersButton() {
  resetFiltersButton.hidden = !hasActiveFilters();
}

function resetFilters() {
  searchInput.value = '';
  categoryFilter.value = 'Все категории';
  sortFilter.value = 'title-asc';
  showArchived.checked = false;
  showFavorites.checked = false;
  visibleFilesCount = FILES_PAGE_SIZE;
  storeFilters();
  updateResetFiltersButton();
  renderFiles();
}

function escapeCsv(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function exportFilteredCsv() {
  const rows = [['Название', 'Категория', 'Автор', 'Загружен', 'Обновлён', 'Версия', 'Архив', 'Путь']];
  getFilteredFiles().forEach((file) => rows.push([
    file.title, file.category, file.author, file.uploadDate, file.updatedDate,
    file.version, file.archived ? 'Да' : 'Нет', getDocumentPath(file) || ''
  ]));
  const csv = `\uFEFF${rows.map((row) => row.map(escapeCsv).join(';')).join('\r\n')}`;
  const link = document.createElement('a');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  link.href = url;
  link.download = `documents-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function appendHighlightedText(parent, tagName, text, className = '') {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  const query = searchInput.value.trim();

  if (!query) {
    element.textContent = text;
    parent.appendChild(element);
    return element;
  }

  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  let cursor = 0;
  String(text).replace(pattern, (match, offset) => {
    element.append(document.createTextNode(String(text).slice(cursor, offset)));
    appendTextElement(element, 'mark', match);
    cursor = offset + match.length;
    return match;
  });
  element.append(document.createTextNode(String(text).slice(cursor)));
  parent.appendChild(element);
  return element;
}

function storeValue(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Настройки останутся активны до перезагрузки страницы.
  }
}

function removeStoredValue(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Browser storage can be restricted.
  }
}

function setAiStatus(message, state = '') {
  aiStatus.textContent = message;
  aiStatus.className = `ai-assistant__status${state ? ` ai-assistant__status--${state}` : ''}`;
}

function findDocumentBySource(source) {
  const sourcePath = typeof source.path === 'string' ? decodeURIComponent(source.path) : '';
  const sourceFileName = typeof source.filename === 'string' ? decodeURIComponent(source.filename) : '';
  const normalizedTitle = normalizeText(source.title || sourceFileName.replace(/\.pdf$/i, ''));

  return files.find((file) => {
    const path = getDocumentPath(file) || '';
    return path === sourcePath
      || decodeURIComponent(path).endsWith(`/${sourceFileName}`)
      || normalizeText(file.title) === normalizedTitle;
  });
}

function renderAiSources(sources) {
  aiSourcesList.replaceChildren();
  const uniqueDocuments = new Map();

  sources.forEach((source) => {
    const file = findDocumentBySource(source);
    if (!file || file.archived) return;
    uniqueDocuments.set(getDocumentPath(file), { file, reason: source.reason || '' });
  });

  uniqueDocuments.forEach(({ file, reason }) => {
    const item = document.createElement('article');
    item.className = 'ai-source';
    const content = document.createElement('div');
    appendTextElement(content, 'strong', file.title);
    appendTextElement(content, 'span', reason || file.description);
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Открыть';
    button.addEventListener('click', () => {
      openViewer(file);
      document.querySelector('.viewer-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    item.append(content, button);
    aiSourcesList.appendChild(item);
  });

  aiSourcesSection.hidden = uniqueDocuments.size === 0;
}

function clearAiAnswer() {
  aiAnswer.hidden = true;
  aiClearButton.hidden = true;
  aiAnswerText.replaceChildren();
  aiSourcesList.replaceChildren();
  aiSourcesSection.hidden = true;
  setAiStatus(aiEndpoint
    ? 'Ответ будет составлен только по материалам портала.'
    : 'ИИ-помощник пока не подключён администратором.');
}

function getCasualAiReply(question) {
  const phrase = normalizeText(question).replace(/[.,!?;:]+/g, '').trim();
  if (/^(спасибо|благодарю|спс|большое спасибо|огромное спасибо)( вам| тебе)?$/.test(phrase)) {
    return 'Всегда рад помочь!';
  }
  if (/^(привет|здравствуйте|добрый день|доброе утро|добрый вечер)$/.test(phrase)) {
    return 'Здравствуйте! Чем помочь по документам портала?';
  }
  if (/^(пока|до свидания|до встречи)$/.test(phrase)) {
    return 'До встречи! Обращайтесь, если понадобится помощь.';
  }
  if (/^(кто ты|что ты умеешь|чем ты можешь помочь)$/.test(phrase)) {
    return 'Я помогу найти нужный документ и отвечу на вопросы по материалам портала.';
  }
  return '';
}

async function askAiAssistant(event) {
  event.preventDefault();
  const question = aiQuestion.value.trim();
  if (!question) {
    setAiStatus('Введите вопрос.', 'error');
    aiQuestion.focus();
    return;
  }
  const casualReply = getCasualAiReply(question);
  if (casualReply) {
    aiAnswerText.textContent = casualReply;
    renderAiSources([]);
    aiAnswer.hidden = false;
    aiClearButton.hidden = false;
    setAiStatus('Готово.');
    return;
  }
  if (!aiEndpoint) {
    setAiStatus('ИИ-помощник пока не подключён администратором.', 'error');
    return;
  }

  aiSubmitButton.disabled = true;
  aiQuestion.disabled = true;
  aiAnswer.hidden = true;
  aiClearButton.hidden = true;
  setAiStatus('Ищу сведения в документах...', 'loading');

  try {
    let payload;
    if (aiProxyEndpoint) {
      payload = await callJsonpApi(aiProxyEndpoint, 'ai', {
        login: getStoredAuthLogin(),
        sessionToken: getStoredAuthToken(),
        question
      }, 120000);
    } else {
      const response = await fetch(aiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question })
      });
      payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось получить ответ.');
    }
    if (payload.error) throw new Error(payload.error);
    if (!payload.answer) throw new Error('Сервис вернул пустой ответ.');

    aiAnswerText.textContent = payload.answer;
    renderAiSources(Array.isArray(payload.sources) ? payload.sources : []);
    aiAnswer.hidden = false;
    aiClearButton.hidden = false;
    setAiStatus(payload.sources?.length
      ? 'Ответ подготовлен. Проверьте первоисточники перед выполнением действий.'
      : 'В документах недостаточно сведений для подтверждённого ответа.');
  } catch (error) {
    setAiStatus(error.message || 'Не удалось получить ответ.', 'error');
  } finally {
    aiSubmitButton.disabled = false;
    aiQuestion.disabled = false;
  }
}

function getStoredAuthLogin() {
  const session = readStoredObject(AUTH_SESSION_KEY);
  return typeof session.login === 'string' ? session.login : '';
}

function getStoredAuthToken() {
  const session = readStoredObject(AUTH_SESSION_KEY);
  return typeof session.token === 'string' ? session.token : '';
}

function setAuthMessage(message, isError = false) {
  authMessage.textContent = message;
  authMessage.classList.toggle('auth-message--error', isError);
}

function setAuthMode(mode) {
  authMode = mode;
  const isRegister = mode === 'register';
  authTitle.textContent = isRegister ? 'Регистрация' : 'Вход в портал';
  authSubmit.textContent = isRegister ? 'Зарегистрироваться' : 'Войти';
  loginModeButton.setAttribute('aria-pressed', String(!isRegister));
  registerModeButton.setAttribute('aria-pressed', String(isRegister));
  confirmPasswordField.hidden = !isRegister;
  passwordInput.autocomplete = isRegister ? 'new-password' : 'current-password';
  confirmPasswordInput.required = isRegister;
  setAuthMessage('');
}

function unlockPortal(login, token = '') {
  storeValue(AUTH_LOGIN_KEY, login);
  if (token) {
    storeValue(AUTH_SESSION_KEY, JSON.stringify({ login, token }));
  }
  document.body.classList.remove('auth-pending');
  loadDocuments();
}

async function callAuthApi(action, payload) {
  if (!authEndpoint) {
    throw new Error('Авторизация еще не настроена: укажите authEndpoint в app.json.');
  }

  return callJsonpApi(authEndpoint, action, payload, 15000);
}

async function callJsonpApi(endpoint, action, payload, timeoutMs) {
  const callbackName = `portalJsonpApi_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const script = document.createElement('script');
  const url = new URL(endpoint);
  url.searchParams.set('action', action);
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  });
  url.searchParams.set('callback', callbackName);
  url.searchParams.set('_', Date.now().toString());

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Сервер авторизации не ответил. Проверьте доступ Apps Script: веб-приложение должно быть доступно всем, у кого есть ссылка.'));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
    };

    window[callbackName] = (result) => {
      cleanup();
      if (!result || typeof result !== 'object') {
        reject(new Error('Некорректный ответ сервера авторизации.'));
        return;
      }
      resolve(result);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error('Не удалось подключиться к серверу авторизации.'));
    };

    script.src = url.toString();
    document.head.appendChild(script);
  });
}

function validateAuthFields(login, password) {
  if (!login) {
    setAuthMessage('Введите логин.', true);
    loginInput.focus();
    return false;
  }
  if (!password) {
    setAuthMessage('Введите пароль.', true);
    passwordInput.focus();
    return false;
  }
  if (authMode === 'register' && password.length < 6) {
    setAuthMessage('Пароль должен быть не короче 6 символов.', true);
    passwordInput.focus();
    return false;
  }
  if (authMode === 'register' && password !== confirmPasswordInput.value) {
    setAuthMessage('Пароли не совпадают.', true);
    confirmPasswordInput.focus();
    return false;
  }
  return true;
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const login = loginInput.value.trim();
  const password = passwordInput.value;
  if (!validateAuthFields(login, password)) return;

  authSubmit.disabled = true;
  setAuthMessage(authMode === 'register' ? 'Регистрируем пароль...' : 'Проверяем доступ...');
  try {
    const result = await callAuthApi(authMode, { login, password });
    if (result.allowed) {
      passwordInput.value = '';
      confirmPasswordInput.value = '';
      unlockPortal(login, result.sessionToken || '');
    } else if (result.needsRegistration) {
      setAuthMode('register');
      setAuthMessage(result.message || 'Для этого логина нужно сначала задать пароль.', true);
      passwordInput.focus();
    } else {
      setAuthMessage(result.message || 'Доступ запрещен.', true);
      removeStoredValue(AUTH_LOGIN_KEY);
      removeStoredValue(AUTH_SESSION_KEY);
      passwordInput.focus();
    }
  } catch (error) {
    setAuthMessage(error.message || 'Не удалось проверить доступ.', true);
  } finally {
    authSubmit.disabled = false;
  }
}

async function initializeAuth() {
  const storedLogin = readStoredValue(AUTH_LOGIN_KEY) || '';
  loginInput.value = storedLogin;
  authForm.addEventListener('submit', handleAuthSubmit);
  loginModeButton.addEventListener('click', () => setAuthMode('login'));
  registerModeButton.addEventListener('click', () => setAuthMode('register'));

  try {
    const response = await fetch('app.json', { cache: 'no-cache' });
    const appConfig = response.ok ? await response.json() : {};
    authEndpoint = String(appConfig.authEndpoint || '').trim();
  } catch {
    authEndpoint = '';
  }

  const storedAuthToken = getStoredAuthToken();
  if (storedLogin && getStoredAuthLogin() === storedLogin && storedAuthToken) {
    document.body.classList.add('auth-checking');
    authTitle.textContent = 'Проверяем доступ';
    setAuthMessage('Проверяем доступ...');
    authSubmit.disabled = true;
    try {
      const result = await callAuthApi('status', { login: storedLogin, sessionToken: storedAuthToken });
      if (result.allowed) {
        unlockPortal(storedLogin, storedAuthToken);
        return;
      }
      removeStoredValue(AUTH_LOGIN_KEY);
      removeStoredValue(AUTH_SESSION_KEY);
      setAuthMessage(result.message || 'Доступ запрещен.', true);
    } catch (error) {
      setAuthMessage(error.message || 'Не удалось проверить доступ.', true);
    } finally {
      document.body.classList.remove('auth-checking');
      authTitle.textContent = 'Вход в портал';
      authSubmit.disabled = false;
    }
    passwordInput.focus();
    return;
  }

  if (!storedLogin) {
    loginInput.focus();
    return;
  }

  setAuthMessage('Введите пароль для сохраненного логина.');
  passwordInput.focus();
}

function isNewDocument(file) {
  const date = parseDate(file.updatedDate || file.uploadDate);
  if (!date) return false;
  const age = Date.now() - date.getTime();
  return age >= 0 && age <= 14 * 24 * 60 * 60 * 1000;
}

function getShareUrl(file) {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('document', getDocumentPath(file));
  return url.toString();
}

async function copyDocumentLink(file, button = null) {
  const link = getShareUrl(file);
  try {
    await navigator.clipboard.writeText(link);
  } catch {
    window.prompt('Скопируйте ссылку на документ:', link);
  }
  if (button) {
    const originalText = button.textContent;
    button.textContent = 'Скопировано';
    setTimeout(() => {
      button.textContent = originalText;
    }, 1500);
  }
}

function toggleFavorite(file) {
  const path = getDocumentPath(file);
  if (!path) return;
  if (favorites.has(path)) favorites.delete(path);
  else favorites.add(path);
  storeValue(FAVORITES_KEY, JSON.stringify([...favorites]));
  renderFiles();
}

function setViewMode(mode) {
  viewMode = mode;
  storeValue(VIEW_KEY, mode);
  fileList.classList.toggle('file-grid--compact', mode === 'compact');
  cardViewButton.setAttribute('aria-pressed', String(mode === 'cards'));
  compactViewButton.setAttribute('aria-pressed', String(mode === 'compact'));
}

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
  const categoryCounts = files.reduce((counts, file) => {
    if (file.archived || !file.category) return counts;
    counts[file.category] = (counts[file.category] || 0) + 1;
    return counts;
  }, {});
  const activeCount = files.filter((file) => !file.archived).length;

  ['Все категории', ...uniqueCategories].forEach((category) => {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category === 'Все категории'
      ? `${category} · ${activeCount}`
      : `${getCategoryIcon(category)} ${category} · ${categoryCounts[category] || 0}`;
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

    const matchesFavorite = !showFavorites.checked || favorites.has(getDocumentPath(file));
    return matchesSearch && matchesCategory && matchesFavorite && (showArchived.checked || !file.archived);
  });

  return filtered.sort((a, b) => {
    if (sortFilter.value === 'title-desc') return String(b.title).localeCompare(String(a.title), 'ru');
    if (sortFilter.value === 'date-desc') return sortByDateDescending(a, b)
      || String(a.title).localeCompare(String(b.title), 'ru');
    if (sortFilter.value === 'date-asc') return sortByDateDescending(b, a)
      || String(a.title).localeCompare(String(b.title), 'ru');
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
  if (isNewDocument(file)) appendTextElement(cardTop, 'span', 'Новое', 'tag tag--new');
  if (file.archived) appendTextElement(cardTop, 'span', 'Архив', 'tag tag--archive');
  const favoriteButton = appendTextElement(cardTop, 'button', favorites.has(path) ? '★' : '☆', 'favorite-button');
  favoriteButton.type = 'button';
  favoriteButton.title = favorites.has(path) ? 'Убрать из избранного' : 'Добавить в избранное';
  favoriteButton.setAttribute('aria-label', favoriteButton.title);
  favoriteButton.addEventListener('click', () => toggleFavorite(file));
  card.appendChild(cardTop);
  appendHighlightedText(card, 'h2', file.title || 'Без названия');
  appendHighlightedText(card, 'p', file.description || '');
  card.appendChild(createMeta(file));

  const actions = document.createElement('div');
  actions.className = 'actions actions--four';
  const previewButton = appendTextElement(actions, 'button', 'Просмотр', 'preview-link');
  previewButton.type = 'button';
  previewButton.disabled = !encodedPath;

  if (encodedPath) {
    const openLink = appendTextElement(actions, 'a', 'Открыть', 'open-link action-secondary');
    openLink.href = encodedPath;
    openLink.target = '_blank';
    openLink.rel = 'noopener';

    const downloadLink = appendTextElement(actions, 'a', 'Скачать', 'download-link');
    downloadLink.href = encodedPath;
    downloadLink.download = '';

    const copyButton = appendTextElement(actions, 'button', 'Ссылка', 'copy-link action-secondary');
    copyButton.type = 'button';
    copyButton.addEventListener('click', () => copyDocumentLink(file, copyButton));

    const mobileMenu = document.createElement('details');
    mobileMenu.className = 'mobile-actions-menu';
    appendTextElement(mobileMenu, 'summary', 'Ещё');
    const mobileMenuItems = document.createElement('div');
    mobileMenuItems.className = 'mobile-actions-menu__items';
    const mobileOpenLink = appendTextElement(mobileMenuItems, 'a', 'Открыть в новой вкладке', 'open-link');
    mobileOpenLink.href = encodedPath;
    mobileOpenLink.target = '_blank';
    mobileOpenLink.rel = 'noopener';
    const mobileCopyButton = appendTextElement(mobileMenuItems, 'button', 'Копировать ссылку', 'copy-link');
    mobileCopyButton.type = 'button';
    mobileCopyButton.addEventListener('click', () => copyDocumentLink(file, mobileCopyButton));
    mobileMenu.appendChild(mobileMenuItems);
    actions.appendChild(mobileMenu);
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

function createRecentItem(file) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'recent-item';
  appendTextElement(item, 'span', getCategoryIcon(file.category), 'recent-item__icon');
  const content = document.createElement('span');
  content.className = 'recent-item__content';
  appendTextElement(content, 'strong', file.title || 'Без названия');
  appendTextElement(content, 'small', `${file.category || 'Без категории'} · обновлён ${file.updatedDate || file.uploadDate || '—'}`);
  item.appendChild(content);
  item.addEventListener('click', () => openViewer(file));
  return item;
}

function recordRecent(file) {
  const path = getDocumentPath(file);
  if (!path) return;
  recentPaths = [path, ...recentPaths.filter((item) => item !== path)].slice(0, 6);
  storeValue(RECENT_KEY, JSON.stringify(recentPaths));
  renderRecent();
}

function renderRecent() {
  const recentFiles = recentPaths
    .map((path) => files.find((file) => getDocumentPath(file) === path))
    .filter(Boolean);
  recentList.replaceChildren();
  recentSection.hidden = recentFiles.length === 0;
  recentFiles.forEach((file) => recentList.appendChild(createRecentItem(file)));
}

function addFilterChip(label, clearFilter) {
  const button = appendTextElement(activeFilters, 'button', `${label} ×`, 'filter-chip');
  button.type = 'button';
  button.setAttribute('aria-label', `Убрать фильтр: ${label}`);
  button.addEventListener('click', () => {
    clearFilter();
    handleFiltersChange();
  });
}

function renderActiveFilters() {
  activeFilters.replaceChildren();

  if (searchInput.value.trim()) addFilterChip(`Поиск: ${searchInput.value.trim()}`, () => { searchInput.value = ''; });
  if (categoryFilter.value !== 'Все категории') addFilterChip(`Категория: ${categoryFilter.value}`, () => { categoryFilter.value = 'Все категории'; });
  if (showArchived.checked) addFilterChip('Показан архив', () => { showArchived.checked = false; });
  if (showFavorites.checked) addFilterChip('Только избранное', () => { showFavorites.checked = false; });

  if (sortFilter.value !== 'title-asc') {
    const selectedSort = sortFilter.options[sortFilter.selectedIndex]?.textContent || 'Изменена сортировка';
    addFilterChip(`Сортировка: ${selectedSort}`, () => { sortFilter.value = 'title-asc'; });
  }

  activeFilters.hidden = activeFilters.childElementCount === 0;
}

function renderFiles() {
  const filteredFiles = getFilteredFiles();
  const availableFiles = showArchived.checked ? files : files.filter((file) => !file.archived);

  fileList.replaceChildren();
  filesCount.textContent = `${filteredFiles.length} / ${availableFiles.length}`;
  documentsSummary.textContent = showArchived.checked
    ? 'Показаны активные и архивные документы.'
    : showFavorites.checked ? 'Показаны только избранные документы.' : 'Архивные документы скрыты.';
  emptyState.hidden = filteredFiles.length > 0;
  renderActiveFilters();

  filteredFiles.slice(0, visibleFilesCount).forEach((file) => fileList.appendChild(createCard(file)));
  showMoreFilesButton.hidden = filteredFiles.length <= visibleFilesCount;
  showMoreFilesButton.textContent = `Показать ещё (${filteredFiles.length - visibleFilesCount})`;
}

function renderPopular() {
  const popularFiles = files
    .filter((file) => !file.archived)
    .sort((a, b) => (Number(documentViews[getDocumentPath(b)] || 0) - Number(documentViews[getDocumentPath(a)] || 0))
      || (Number(Boolean(b.popular)) - Number(Boolean(a.popular)))
      || String(a.title).localeCompare(String(b.title), 'ru'))
    .slice(0, 6);
  popularList.replaceChildren();
  popularSection.hidden = popularFiles.length === 0;
  popularFiles.forEach((file) => popularList.appendChild(createPopularCard(file)));
}

function renderChangelog() {
  changelogList.replaceChildren();

  changelog.slice(0, visibleChangelogCount).forEach((item) => {
    const node = document.createElement('article');
    node.className = 'timeline-item';
    appendTextElement(node, 'time', item.date || '—');
    const content = document.createElement('div');
    appendTextElement(content, 'h3', item.title || 'Изменение');
    appendTextElement(content, 'p', item.description || '');
    node.appendChild(content);
    changelogList.appendChild(node);
  });
  showMoreChangelogButton.hidden = changelog.length <= visibleChangelogCount;
  showMoreChangelogButton.textContent = `Показать ещё (${changelog.length - visibleChangelogCount})`;
}

function renderRelated(file) {
  const relatedFiles = files
    .filter((item) => !item.archived && item.category === file.category && getDocumentPath(item) !== getDocumentPath(file))
    .slice(0, 4);
  relatedList.replaceChildren();
  relatedSection.hidden = relatedFiles.length === 0;
  relatedFiles.forEach((item) => relatedList.appendChild(createRecentItem(item)));
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
  currentViewerFile = file;
  const pathViews = getDocumentPath(file);
  documentViews[pathViews] = Number(documentViews[pathViews] || 0) + 1;
  storeValue(VIEWS_KEY, JSON.stringify(documentViews));
  recordRecent(file);
  renderPopular();
  renderRelated(file);
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
  const url = new URL(window.location.href);
  url.searchParams.set('document', path);
  history.replaceState(null, '', url);
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
  currentViewerFile = null;
  relatedSection.hidden = true;
  relatedList.replaceChildren();
  const url = new URL(window.location.href);
  url.searchParams.delete('document');
  history.replaceState(null, '', url);
});

async function loadDocuments() {
  try {
    const [documentsResponse, changelogResponse, categoriesResponse, appResponse] = await Promise.all([
      fetch('documents.json', { cache: 'no-cache' }),
      fetch('changelog.json', { cache: 'no-cache' }),
      fetch('categories.json', { cache: 'no-cache' }),
      fetch('app.json', { cache: 'no-cache' })
    ]);

    if (!documentsResponse.ok) throw new Error('Не удалось загрузить documents.json');

    files = await documentsResponse.json();
    changelog = changelogResponse.ok ? await changelogResponse.json() : [];
    const categories = categoriesResponse.ok ? await categoriesResponse.json() : [];
    const appConfig = appResponse.ok ? await appResponse.json() : {};
    categoryIcons = Object.fromEntries(categories.map((category) => [category.name, category.icon]));
    portalVersion.textContent = appConfig.version || portalVersion.textContent;
    aiEndpoint = typeof appConfig.aiEndpoint === 'string' ? appConfig.aiEndpoint.trim() : '';
    aiProxyEndpoint = typeof appConfig.aiProxyEndpoint === 'string'
      ? appConfig.aiProxyEndpoint.trim()
      : '';
    clearAiAnswer();

    sortFiles();
    setupCategories();
    applyStoredFilters();
    updateResetFiltersButton();
    updateDashboard();
    renderPopular();
    renderRecent();
    renderFiles();
    renderChangelog();
    setViewMode(viewMode);
    const requestedPath = new URLSearchParams(window.location.search).get('document');
    const requestedFile = files.find((file) => getDocumentPath(file) === requestedPath);
    if (requestedFile) openViewer(requestedFile);
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

function handleFiltersChange() {
  visibleFilesCount = FILES_PAGE_SIZE;
  storeFilters();
  updateResetFiltersButton();
  renderFiles();
}

searchInput.addEventListener('input', handleFiltersChange);
categoryFilter.addEventListener('change', handleFiltersChange);
sortFilter.addEventListener('change', handleFiltersChange);
showArchived.addEventListener('change', handleFiltersChange);
showFavorites.addEventListener('change', handleFiltersChange);
resetFiltersButton.addEventListener('click', resetFilters);
exportCsvButton.addEventListener('click', exportFilteredCsv);
showMoreFilesButton.addEventListener('click', () => {
  visibleFilesCount += FILES_PAGE_SIZE;
  renderFiles();
});
showMoreChangelogButton.addEventListener('click', () => {
  visibleChangelogCount += CHANGELOG_PAGE_SIZE;
  renderChangelog();
});
clearRecentButton.addEventListener('click', () => {
  recentPaths = [];
  storeValue(RECENT_KEY, '[]');
  renderRecent();
});
cardViewButton.addEventListener('click', () => setViewMode('cards'));
compactViewButton.addEventListener('click', () => setViewMode('compact'));
viewerCopyLink.addEventListener('click', () => {
  if (currentViewerFile) copyDocumentLink(currentViewerFile, viewerCopyLink);
});
aiForm.addEventListener('submit', askAiAssistant);
aiClearButton.addEventListener('click', clearAiAnswer);
aiQuestion.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    aiForm.requestSubmit();
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !pdfViewer.hidden) closeViewer.click();
});
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js?v=2.5.6', { updateViaCache: 'none' }).catch(() => {});
}
initializeAuth();
