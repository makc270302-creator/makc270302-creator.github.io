const SPREADSHEET_ID = '1ppTZqoJTEvqy5m0LEkm0gpZNJKU_taTGX6ZWBwb8-xk';
const USERS_SHEET_NAME = 'Пользователи';
const LOGIN_COLUMN = 1;
const POSITION_COLUMN = 3;
const PASSWORD_COLUMN = 6;
const AI_WORKER_URL = 'https://pdf-portal-ai.makc270302.workers.dev/ask';

function authorizeAiProxy() {
  const response = UrlFetchApp.fetch(AI_WORKER_URL.replace('/ask', '/health'));
  Logger.log(response.getContentText());
}

function doPost(event) {
  try {
    const payload = JSON.parse(event.postData.contents || '{}');
    return jsonResponse(handleAuthPayload(payload));
  } catch (error) {
    return jsonResponse({ allowed: false, message: error.message || 'Ошибка авторизации.' });
  }
}

function doGet(event) {
  const payload = event.parameter || {};
  const callback = String(payload.callback || '').trim();
  const result = String(payload.action || '') === 'ai'
    ? handleAiPayload(payload)
    : handleAuthPayload(payload);

  if (isSafeCallbackName(callback)) {
    return javascriptResponse(`${callback}(${JSON.stringify(result)});`);
  }

  return jsonResponse(result);
}

function handleAiPayload(payload) {
  try {
    const question = String(payload.question || '').trim();
    if (!question) return { error: 'Введите вопрос.' };
    if (question.length > 1200) return { error: 'Вопрос должен быть короче 1200 символов.' };

    const session = handleAuthPayload({
      action: 'status',
      login: payload.login,
      sessionToken: payload.sessionToken
    });
    if (!session.allowed) {
      return { error: session.message || 'Сессия устарела. Войдите снова.' };
    }

    const response = UrlFetchApp.fetch(AI_WORKER_URL, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'X-Portal-Proxy': 'google-apps-script' },
      payload: JSON.stringify({ question }),
      muteHttpExceptions: true
    });
    const result = JSON.parse(response.getContentText() || '{}');
    if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
      return { error: result.error || 'Сервис поиска временно недоступен.' };
    }
    return result;
  } catch (error) {
    return { error: error.message || 'Не удалось получить ответ.' };
  }
}

function handleAuthPayload(payload) {
  try {
    const action = String(payload.action || '').trim();
    const login = String(payload.login || '').trim();
    const password = String(payload.password || '');
    const sessionToken = String(payload.sessionToken || '');

    if (!login) return { allowed: false, message: 'Введите логин.' };
    if (action !== 'login' && action !== 'register' && action !== 'status') return { allowed: false, message: 'Неизвестное действие.' };

    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(USERS_SHEET_NAME);
    if (!sheet) return { allowed: false, message: 'Лист пользователей не найден.' };

    const rowInfo = findUserRow(sheet, login);
    if (!rowInfo) return { allowed: false, message: 'Логин не найден.' };
    if (String(rowInfo.values[POSITION_COLUMN - 1] || '').toLowerCase().includes('уволен')) {
      return { allowed: false, message: 'Доступ запрещен: пользователь отмечен как уволенный.' };
    }

    const passwordCell = sheet.getRange(rowInfo.rowNumber, PASSWORD_COLUMN);
    const storedPassword = String(passwordCell.getDisplayValue() || '').trim();

    if (action === 'status') {
      if (storedPassword && sessionToken === createSessionToken(login, storedPassword)) {
        return { allowed: true };
      }
      return { allowed: false, message: 'Сессия устарела. Войдите снова.' };
    }

    if (!password) return { allowed: false, message: 'Введите пароль.' };

    if (action === 'register') {
      if (password.length < 6) return { allowed: false, message: 'Пароль должен быть не короче 6 символов.' };
      if (storedPassword) return { allowed: false, message: 'Для этого логина пароль уже задан.' };
      passwordCell.setValue(password);
      return { allowed: true, sessionToken: createSessionToken(login, password) };
    }

    if (!storedPassword) {
      return {
        allowed: false,
        needsRegistration: true,
        message: 'Для этого логина нужно сначала зарегистрировать пароль.'
      };
    }

    if (!isPasswordValid(login, password, storedPassword)) {
      return { allowed: false, message: 'Неверный логин или пароль.' };
    }

    if (isLegacyPasswordHash(storedPassword)) {
      passwordCell.setValue(password);
    }

    return { allowed: true, sessionToken: createSessionToken(login, password) };
  } catch (error) {
    return { allowed: false, message: error.message || 'Ошибка авторизации.' };
  }
}

function findUserRow(sheet, login) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const values = sheet.getRange(2, 1, lastRow - 1, PASSWORD_COLUMN).getDisplayValues();
  const normalizedLogin = normalizeLogin(login);
  const index = values.findIndex((row) => normalizeLogin(row[LOGIN_COLUMN - 1]) === normalizedLogin);
  if (index === -1) return null;

  return {
    rowNumber: index + 2,
    values: values[index]
  };
}

function normalizeLogin(value) {
  return String(value || '').trim().toLowerCase();
}

function isPasswordValid(login, password, storedPassword) {
  if (storedPassword === password) return true;
  return isLegacyPasswordHash(storedPassword) && storedPassword === hashPassword(login, password);
}

function isLegacyPasswordHash(storedPassword) {
  return String(storedPassword || '').startsWith('sha256$');
}

function hashPassword(login, password) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    `${normalizeLogin(login)}:${password}`,
    Utilities.Charset.UTF_8
  );
  const hash = bytes.map((byte) => {
    const value = byte < 0 ? byte + 256 : byte;
    return value.toString(16).padStart(2, '0');
  }).join('');
  return `sha256$${hash}`;
}

function createSessionToken(login, storedPassword) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    `${normalizeLogin(login)}:${storedPassword}:portal-session-v1`,
    Utilities.Charset.UTF_8
  );
  const hash = bytes.map((byte) => {
    const value = byte < 0 ? byte + 256 : byte;
    return value.toString(16).padStart(2, '0');
  }).join('');
  return `session$${hash}`;
}

function isSafeCallbackName(callback) {
  return /^[A-Za-z_$][0-9A-Za-z_$]*(\.[A-Za-z_$][0-9A-Za-z_$]*)*$/.test(callback);
}

function javascriptResponse(source) {
  return ContentService
    .createTextOutput(source)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
