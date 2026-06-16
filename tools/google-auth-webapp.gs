const SPREADSHEET_ID = '1ppTZqoJTEvqy5m0LEkm0gpZNJKU_taTGX6ZWBwb8-xk';
const USERS_SHEET_NAME = 'Пользователи';
const LOGIN_COLUMN = 1;
const POSITION_COLUMN = 3;
const PASSWORD_COLUMN = 6;

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
  const result = handleAuthPayload(payload);

  if (isSafeCallbackName(callback)) {
    return javascriptResponse(`${callback}(${JSON.stringify(result)});`);
  }

  return jsonResponse(result);
}

function handleAuthPayload(payload) {
  try {
    const action = String(payload.action || '').trim();
    const login = String(payload.login || '').trim();
    const password = String(payload.password || '');

    if (!login || !password) return { allowed: false, message: 'Введите логин и пароль.' };
    if (action !== 'login' && action !== 'register') return { allowed: false, message: 'Неизвестное действие.' };

    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(USERS_SHEET_NAME);
    if (!sheet) return { allowed: false, message: 'Лист пользователей не найден.' };

    const rowInfo = findUserRow(sheet, login);
    if (!rowInfo) return { allowed: false, message: 'Логин не найден.' };
    if (String(rowInfo.values[POSITION_COLUMN - 1] || '').toLowerCase().includes('уволен')) {
      return { allowed: false, message: 'Доступ запрещен: пользователь отмечен как уволенный.' };
    }

    const passwordCell = sheet.getRange(rowInfo.rowNumber, PASSWORD_COLUMN);
    const storedPassword = String(passwordCell.getDisplayValue() || '').trim();

    if (action === 'register') {
      if (password.length < 6) return { allowed: false, message: 'Пароль должен быть не короче 6 символов.' };
      if (storedPassword) return { allowed: false, message: 'Для этого логина пароль уже задан.' };
      passwordCell.setValue(hashPassword(login, password));
      return { allowed: true };
    }

    if (!storedPassword) {
      return {
        allowed: false,
        needsRegistration: true,
        message: 'Для этого логина нужно сначала зарегистрировать пароль.'
      };
    }

    if (storedPassword !== hashPassword(login, password)) {
      return { allowed: false, message: 'Неверный логин или пароль.' };
    }

    return { allowed: true };
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
