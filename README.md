# Prism

Prism is an interactive AI study workspace. Students solve, write, and revise inside a subject while the tutor stays silent on correct work and intervenes only when help is needed.

## What works

- Email/password authentication with optional Google OAuth
- User-owned subject workspaces persisted in SQLite
- PDF and text extraction plus local Tesseract OCR for study photos
- Curriculum dependency mapping and adaptive practice
- Per-step correctness checks, confidence tagging, and a four-level hint ladder
- Theory answer generation and structural rubric grading
- Diagnostics, mastery tracking, and daily reports
- Direct GLM-4.7-Flash integration through Zhipu's OpenAI-compatible API

## Run locally

Requirements: Node.js 20 or newer and pnpm.

```powershell
Copy-Item .env.example .env
pnpm install
pnpm exec prisma generate
New-Item -ItemType File -Path db\prism.db -Force
pnpm exec prisma db push
pnpm dev
```

Open `http://localhost:3000`.

Add `ZAI_API_KEY` to `.env` to enable live GLM-4.7-Flash responses. Without a key, Prism runs deterministic demo fallbacks so the full product flow remains testable.

For Google sign-in, create an OAuth 2.0 web client in Google Cloud and set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Use this local callback URL:

```text
http://localhost:3000/api/auth/callback/google
```

## Validation

```powershell
pnpm exec tsc --noEmit
pnpm build
```
