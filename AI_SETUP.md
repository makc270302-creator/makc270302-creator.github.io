# ИИ-помощник по PDF

Помощник работает на Cloudflare Workers AI и Vectorize. OpenAI API не используется.

## Компоненты

- `worker/src/index.js` — поиск и формирование ответа;
- `worker/wrangler.toml` — bindings Workers AI и Vectorize;
- `tools/build-ai-chunks.mjs` — извлечение текста из PDF;
- `tools/migrate-to-cloudflare-ai.ps1` — создание индекса, публикация и загрузка фрагментов.

Используемые модели:

- `@cf/qwen/qwen3-embedding-0.6b` — многоязычный смысловой поиск;
- `@cf/meta/llama-3.3-70b-instruct-fp8-fast` — ответы по найденным фрагментам.

## Обновление индекса

После добавления или замены PDF запустите:

```powershell
powershell -ExecutionPolicy Bypass -File tools/migrate-to-cloudflare-ai.ps1
```

В открывшемся окне вставьте Cloudflare API token с правами:

- `Workers Scripts: Edit`;
- `Vectorize: Edit`;
- `Account Settings: Read`.

Скрипт повторно извлечёт текст всех активных PDF и обновит фрагменты в Vectorize.

## Проверка

Состояние Worker:

```text
https://pdf-portal-ai.makc270302.workers.dev/health
```

Ожидаемый ответ:

```json
{"status":"ok","provider":"cloudflare-workers-ai","configured":true}
```

Endpoint сайта указан в `app.json`.

## Бесплатные лимиты

Cloudflare Workers AI предоставляет бесплатную суточную квоту. После её исчерпания
запросы временно перестанут выполняться до следующего суточного сброса. Vectorize
также имеет бесплатный месячный лимит, достаточный для текущего индекса портала.
