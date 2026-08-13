# Prism

Prism is an Interactive AI study teacher: students solve one step at a time, the evaluator stays silent on valid work, and a four-level hint ladder appears only when requested or when the path breaks.

## What is implemented

- Firebase Google and email/password authentication with verified backend ID tokens
- Source-first notebook workspace with selectable material, cited questions, follow-up prompts, editable notes, and upload
- Interactive studio for browser audio overview, study guides, flippable flashcards, and graded quizzes
- User-scoped subjects, resources, attempts, diagnostics, plans, and reports
- PDF/image/DOCX upload with persistent per-file ingestion status
- PyMuPDF extraction check for digital versus scanned PDFs
- GLM-4.7-Flash study agent for source-grounded curriculum mapping, tiered hints, method feedback, and theory grading
- Layered curriculum dependency map with server-normalized spacing, exam weight, and prerequisite arrows
- Short adaptive placement check
- MathLive step editor, per-step confidence, path evaluation, and error tagging
- Four-level hint ladder and better-method feedback
- Recalculating study plan and Google Calendar intent stub
- Daily report with hint trend, error taxonomy, and confidence calibration
- Responsive desktop/mobile UI and SQLite persistence

The local evaluator and seeded map remain deterministic fallbacks, so the demo still works without a network or API key. Every AI response reports whether it came from live GLM-4.7-Flash or the fallback path.

## Architecture alignment

The DEMUX deck defines this target stack:

| Layer | Deck architecture | Current repository |
| --- | --- | --- |
| Frontend | React + Vite, Tailwind, MathLive, Redux Toolkit | React + Vite, MathLive, Lucide, scoped CSS, React state |
| Backend | Python 3.12, FastAPI, Uvicorn, Firebase Auth | FastAPI, Uvicorn, Firebase Admin token verification, SQLite persistence |
| AI | GLM-4.7-Flash, step classification, coaching, LangChain RAG | GLM-4.7-Flash structured agent, deterministic step evaluator and fallbacks |
| Data | Firestore/Storage, Chroma, sentence-transformers, FSRS | Local uploads, PyMuPDF extraction, persisted SQLite maps and attempts |
| Processing | PyMuPDF and Tesseract OCR | PyMuPDF live; image OCR is a status-aware adapter boundary |
| Deployment | Vercel, Render, Firebase Storage, self-hosted Chroma | Single-container Docker deployment with persistent `/app/backend/data` |

The source notebook APIs are deliberately shaped for the Chroma/LangChain adapter: selected resource IDs are resolved server-side, only readable subject-owned text enters the prompt, and returned citations are validated against those exact sources.

## Run locally

For the demo, double-click `START_PRISM.cmd`. It starts the API, serves the built frontend, and opens the app automatically at `http://localhost:8000`. Choose **Explore demo workspace** on the sign-in screen.

Double-click `STOP_PRISM.cmd` when you are finished.

For frontend development with hot reload, open two PowerShell terminals.

```powershell
cd "C:\Users\rajul\Downloads\subash files\hackathon\prism\backend"
python -m uvicorn main:app --reload --port 8000
```

```powershell
cd "C:\Users\rajul\Downloads\subash files\hackathon\prism\frontend"
npm install
npm run dev
```

Open `http://localhost:5173`. Uploaded files are stored under `backend/data/uploads`; local progress lives in `backend/data/prism.db`.

## Configure Firebase sign-in

1. Create a Firebase project and a Web app in the [Firebase console](https://console.firebase.google.com/).
2. In **Authentication > Sign-in method**, enable **Google** and **Email/Password**.
3. Add `localhost` and your deployed domain under **Authentication > Settings > Authorized domains**.
4. Copy `frontend/.env.example` to `frontend/.env.local` and fill in the six values from the Web app configuration.
5. Generate a Firebase service account key from **Project settings > Service accounts**.
6. Copy `backend/.env.example` to `backend/.env`. Set `FIREBASE_PROJECT_ID` and set `FIREBASE_SERVICE_ACCOUNT_JSON` to either the key file path or the complete JSON value.
7. Set a strong `APP_SECRET`. In production, set `APP_ENV=production` and `ENABLE_DEMO_AUTH=false`.

The browser obtains a Firebase ID token after sign-in and sends it as `Authorization: Bearer <token>`. FastAPI verifies the signature, expiry, project, and revocation state through Firebase Admin before accessing user data.

## Configure GLM-4.7-Flash

1. Create an API key in the [Zhipu AI Open Platform](https://open.bigmodel.cn/).
2. Copy `backend/.env.example` to `backend/.env`.
3. Set `GLM_API_KEY` in `backend/.env`; leave `GLM_MODEL=glm-4.7-flash`.
4. Restart Prism with `START_PRISM.cmd`.

The API key stays on the FastAPI server. Prism uses the official chat-completions endpoint with JSON output and treats uploaded text as untrusted reference material. A clean PDF or text upload triggers curriculum extraction in the background; requested hints and final method comparisons use the same agent at study time.

## Verify

```powershell
cd backend
python -m pytest -q

cd ..\frontend
npm run build
npm audit --audit-level=moderate
```

## API surface

- `POST /api/auth/demo`
- `GET /api/dashboard`
- `POST /api/subjects`
- `POST /api/subjects/{id}/resources`
- `GET /api/subjects/{id}/map`
- `POST /api/subjects/{id}/ask`
- `POST /api/subjects/{id}/studio/{study-guide|flashcards|quiz}`
- `GET|POST /api/subjects/{id}/diagnostic`
- `GET /api/subjects/{id}/practice`
- `POST /api/subjects/{id}/practice/{problem}/steps`
- `POST /api/subjects/{id}/practice/{problem}/hint`
- `POST /api/subjects/{id}/planner`
- `GET /api/subjects/{id}/report`

Interactive API documentation is available at `http://localhost:8000/docs`.

## Production deployment

The included `Dockerfile` builds the React app and serves it from FastAPI as one container. Firebase web values are Vite build arguments; backend secrets are runtime environment variables. Mount persistent storage at `/app/backend/data` if SQLite is retained in production.

```powershell
docker build -t prism `
  --build-arg VITE_FIREBASE_API_KEY="..." `
  --build-arg VITE_FIREBASE_AUTH_DOMAIN="..." `
  --build-arg VITE_FIREBASE_PROJECT_ID="..." `
  --build-arg VITE_FIREBASE_STORAGE_BUCKET="..." `
  --build-arg VITE_FIREBASE_MESSAGING_SENDER_ID="..." `
  --build-arg VITE_FIREBASE_APP_ID="..." .
```

Run with `APP_SECRET`, `FIREBASE_PROJECT_ID`, and `FIREBASE_SERVICE_ACCOUNT_JSON` supplied securely by the hosting platform. Never commit either `.env` file or the service-account key.

## Remaining service adapters

1. In the resource background task, send image/scanned pages through Tesseract, then chunk and embed into a subject-scoped Chroma collection.
2. Replace the local valid-path arrays with pre-generated solution trees and symbolic equivalence checks.
3. Persist FSRS cards per concept; keep recall cards separate from problem-solving mastery.

No secret is required for the local demo workspace. Google and email sign-in require Firebase configuration.
