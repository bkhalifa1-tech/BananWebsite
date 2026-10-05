# Study OS

An original, bilingual learning workspace built incrementally through the ten MVP phases. Accounts, semesters, courses, private files, notes, exams, grades/GPA, planner, focus sessions, flashcards, quizzes, analytics, study recommendations and personal learning spaces use persistent SQLite data. Email recovery/verification and AI provider adapters are implemented; live provider activation still needs credentials. See [implementation status and limits](docs/IMPLEMENTATION_PLAN.md).

## Local development

Node.js **24** and npm are required. No external database or email credentials are required for local development.

```sh
npm ci --cache /tmp/study-os-npm-cache
npm run dev
```

Port 3000 serves both the frontend and API. Vite updates the frontend; `tsx watch` restarts the backend on changes. The server loads `.env` if present; injected environment values take precedence. Copy `.env.example` only if you need local overrides, and never commit real credentials.

SQLite is created in `.data/study.sqlite`. Accounts, preferences, sessions, workspaces, uploaded files, notes, tasks, exams/grades, events, study history, reviews, quiz attempts, mistakes and AI conversations persist across restarts. New feature tables migrate additively. The transactional workspace migration preserves existing courses and child records while allowing personal spaces without semesters; it verifies foreign keys. Existing accounts are **not** automatically marked as email-verified. Back up the database before migrations; use SQLite's backup API or stop the server before copying the database and its WAL files. Keep `.data` private and out of Git.

## Email delivery

Without provider credentials, during `npm run dev`, emails are saved as private JSON files in `.data/mail` (override with `MAIL_DIRECTORY`). This is a development mailbox, **not external delivery**. Open the relevant local file privately and follow its `url` to test verification or password recovery. These files contain single-use links: do not share, commit or expose them through HTTP. Browser tests force `MAIL_DELIVERY=local` and read only their separate mailbox in `/tmp/study-os-e2e-mail`. This development-only override takes precedence over email credentials and is rejected in production.

For real delivery, configure a verified Resend sender:

| Variable         | Purpose                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| `RESEND_API_KEY` | Server-only Resend credential; enter securely in environment settings or an ignored local `.env`. |
| `MAIL_FROM`      | A sender address from your verified Resend domain.                                                |
| `APP_URL`        | The canonical public **HTTPS** URL used to create links; never derived from request headers.      |
| `PORT`           | Server port, default 3000.                                                                        |
| `DATABASE_PATH`  | Private SQLite path, default `.data/study.sqlite`.                                                |

Allow outbound HTTPS to `api.resend.com`. Adding a credential requirement does not supply its value. The provider adapter is implemented but real external delivery requires working credentials, a verified sender and a deployment URL; it has not been validated without those settings.

`npm start` serves the production build with Secure HttpOnly cookies and requires verified email for **all study APIs**. If delivery is missing, production registration fails with HTTP 503; it does not silently fall back to local email. Production email configuration must use an explicit HTTPS `APP_URL`. Existing users may sign in to request verification, but cannot access study data until verified. In local development, unverified accounts can exercise study features, and the UI identifies local email delivery.

Verification links expire in 24 hours. Reset links expire in 30 minutes. Token hashes are stored in the database; raw tokens appear only in the delivered message. Links use fragments to avoid sending tokens as ordinary HTTP paths/referrers. Tokens are single-use and purpose-scoped. Issuing a new link replaces the previous one. Resetting a password invalidates all user sessions and pending tokens. Reset requests return the same response for known and unknown emails. Per-IP auth throttling and per-account email cooldowns limit abuse.

For public deployment, use HTTPS termination, a durable private database volume, backups, and an appropriate upstream/shared limiter for multiple instances. SQLite is intended for the current single-instance architecture. Email integration is not proof of a completed production deployment.

## Validation

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Run browser tests with the installed Chromium:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
```

If Chromium is absent, install Playwright's browser using its official command with `PLAYWRIGHT_BROWSERS_PATH` set to a writable directory. Browser tests launch a separate server on port 3100, with database and mail fixtures in `/tmp`; they never use the application's database or send real messages.

API tests cover ownership/cascades, safe uploads, autosave conflicts, weighted grades/GPA, server-clock focus time, spaced reviews, six quiz types, recommendations, real analytics, personal-space migration, worker extraction, controlled AI integration and account recovery/security. Browser tests cover the account lifecycle, both learning paths, semester switching, course deep links, task completion, appearance independence, RTL/LTR, mobile layout, verification and password recovery.

## Learning workflows

Create a semester and courses in **My semester**, or create goal-based learning spaces in **Personal study**. Open a workspace to upload/read PDFs or images, write autosaved notes, manage tasks and practice with cards/quizzes. Semester courses also have weighted grades, exams and configurable GPA. Use Planner, Focus and Analytics from the sidebar; the selected learning track filters workspaces and analytics.

The recommendation engine ranks real deadlines, exams, weak quiz topics and due flashcards, then fits a plan to your available time. Its session link opens Focus with the workspace, topic and length filled in. Task completion and measured accuracy are clearly labeled; no study data is prepopulated.

## AI tutor and file actions

The provider abstraction and PDF/note actions are implemented. AI controls are hidden when no provider is configured. To activate the default adapter, set server-only `AI_API_KEY` securely and optionally `AI_MODEL` (default `gpt-4.1-mini`), then restart the server. Allow outbound HTTPS to `api.openai.com`. Set `AI_ENABLED=false` to disable the feature, including during browser tests.

The tutor supports general questions and source-based summarization, explanation, key concepts and study guides. Conversations persist and can be reopened or deleted. The UI explains that questions and selected excerpts go to the external provider. PDF text extraction runs in a worker with a timeout, and includes at most 30 pages/30,000 characters. Scanned documents require OCR, which is not included. Requests have per-user limits and provider timeouts; a failed provider never generates fabricated answers.

Automated tests inject a controlled AI provider and test the actual worker/API/browser integration; they do not send paid live requests. Live OpenAI integration requires working credentials and has not been verified without them. Full RAG and advanced media/translation features remain future scope; see the implementation document for precise limits.
