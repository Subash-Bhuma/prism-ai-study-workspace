from __future__ import annotations

import json
import os
import re
import sqlite3
import time
import uuid
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Literal

import jwt
from dotenv import load_dotenv
from fastapi import BackgroundTasks, Depends, FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from ai_agent import GLMStudyAgent

load_dotenv()


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
DB_PATH = DATA_DIR / "prism.db"
APP_SECRET = os.getenv("APP_SECRET", "prism-local-secret-change-in-production")
APP_ENV = os.getenv("APP_ENV", "development")
ENABLE_DEMO_AUTH = os.getenv("ENABLE_DEMO_AUTH", "true" if APP_ENV != "production" else "false").lower() == "true"
bearer_scheme = HTTPBearer(auto_error=False)
_firebase_app = None
study_agent = GLMStudyAgent()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def uid(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:10]}"


def connect() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH, check_same_thread=False)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def json_value(value: object) -> str:
    return json.dumps(value, separators=(",", ":"))


def firebase_app():
    global _firebase_app
    if _firebase_app is not None:
        return _firebase_app

    import firebase_admin
    from firebase_admin import credentials

    service_account = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "").strip()
    project_id = os.getenv("FIREBASE_PROJECT_ID", "").strip()
    options = {"projectId": project_id} if project_id else None
    if service_account:
        credential_data = json.loads(service_account) if service_account.startswith("{") else service_account
        credential = credentials.Certificate(credential_data)
        _firebase_app = firebase_admin.initialize_app(credential, options)
    else:
        _firebase_app = firebase_admin.initialize_app(options=options)
    return _firebase_app


def upsert_authenticated_user(identity: dict) -> dict:
    firebase_uid = str(identity["uid"])
    email = str(identity.get("email") or f"{firebase_uid}@firebase.local").lower()
    name = str(identity.get("name") or email.split("@")[0]).strip()[:80] or "Student"
    user_id = f"fb_{firebase_uid}"
    with connect() as db:
        existing = db.execute("SELECT * FROM users WHERE id = ? OR email = ?", (user_id, email)).fetchone()
        if existing:
            db.execute("UPDATE users SET name = ?, email = ? WHERE id = ?", (name, email, existing["id"]))
            db.commit()
            return row_dict(db.execute("SELECT * FROM users WHERE id = ?", (existing["id"],)).fetchone())
        db.execute(
            "INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?)",
            (user_id, name, email, "Undergraduate", "Current semester", None, utc_now()),
        )
        db.commit()
        return row_dict(db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone())


def require_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme)) -> dict:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in required")
    token = credentials.credentials
    try:
        if token.startswith("ey"):
            try:
                claims = jwt.decode(token, APP_SECRET, algorithms=["HS256"], audience="prism-web")
                if claims.get("provider") != "demo" or not ENABLE_DEMO_AUTH:
                    raise jwt.InvalidTokenError("Demo authentication is disabled")
                with connect() as db:
                    user = db.execute("SELECT * FROM users WHERE id = ?", (claims["sub"],)).fetchone()
                if not user:
                    raise jwt.InvalidTokenError("Demo account not found")
                return row_dict(user)
            except jwt.InvalidTokenError:
                pass

        from firebase_admin import auth

        decoded = auth.verify_id_token(token, app=firebase_app(), check_revoked=True)
        return upsert_authenticated_user(decoded)
    except Exception as error:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Your session is invalid or expired") from error


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    with connect() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
              id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
              course TEXT NOT NULL, semester TEXT NOT NULL, exam_date TEXT,
              created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS subjects (
              id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL,
              code TEXT NOT NULL, exam_date TEXT, accent TEXT NOT NULL,
              mastery INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS resources (
              id TEXT PRIMARY KEY, subject_id TEXT NOT NULL, name TEXT NOT NULL,
              kind TEXT NOT NULL, size INTEGER NOT NULL, status TEXT NOT NULL,
              detail TEXT NOT NULL, pages INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL, extracted_text TEXT NOT NULL DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS attempts (
              id TEXT PRIMARY KEY, subject_id TEXT NOT NULL, problem_id TEXT NOT NULL,
              step_index INTEGER NOT NULL, latex TEXT NOT NULL, confidence TEXT NOT NULL,
              correct INTEGER NOT NULL, error_type TEXT, hint_level INTEGER NOT NULL,
              created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS diagnostic_answers (
              id TEXT PRIMARY KEY, subject_id TEXT NOT NULL, question_id TEXT NOT NULL,
              answer TEXT NOT NULL, correct INTEGER NOT NULL, created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS subject_state (
              subject_id TEXT PRIMARY KEY, problem_index INTEGER NOT NULL DEFAULT 0,
              hint_level INTEGER NOT NULL DEFAULT 0, diagnostic_complete INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS subject_maps (
              subject_id TEXT PRIMARY KEY, graph_json TEXT,
              status TEXT NOT NULL DEFAULT 'pending', error TEXT,
              updated_at TEXT NOT NULL
            );
            """
        )
        resource_columns = {row[1] for row in db.execute("PRAGMA table_info(resources)")}
        if "extracted_text" not in resource_columns:
            db.execute("ALTER TABLE resources ADD COLUMN extracted_text TEXT NOT NULL DEFAULT ''")
        if not db.execute("SELECT 1 FROM users LIMIT 1").fetchone():
            seed_demo(db)


def seed_demo(db: sqlite3.Connection) -> None:
    user_id = "usr_demo"
    subject_id = "sub_differential"
    db.execute(
        "INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?)",
        (user_id, "Aarav", "demo@prism.study", "B.Tech Mathematics", "Semester 3", "2026-09-02", utc_now()),
    )
    db.execute(
        "INSERT INTO subjects VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (subject_id, user_id, "Differential Equations", "MA201", "2026-09-02", "#186A5A", 64, utc_now()),
    )
    resources = [
        ("res_notes", subject_id, "Unit 2 - First Order DE.pdf", "Course notes", 2_480_000, "ready", "Parsed cleanly Â· 86 chunks", 34),
        ("res_papers", subject_id, "Past papers 2022-25.pdf", "Past papers", 5_120_000, "ready", "Parsed cleanly Â· 18 questions", 41),
        ("res_scan", subject_id, "Professor Rao - board notes.jpg", "Photo", 1_360_000, "warning", "OCR confidence low near lower margin", 1),
    ]
    db.executemany(
        """INSERT INTO resources
           (id, subject_id, name, kind, size, status, detail, pages, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        [(*r, utc_now()) for r in resources],
    )
    db.execute("INSERT INTO subject_state VALUES (?, 0, 0, 0)", (subject_id,))


@asynccontextmanager
async def lifespan(_: FastAPI):
    if APP_ENV == "production" and APP_SECRET == "prism-local-secret-change-in-production":
        raise RuntimeError("Set a strong APP_SECRET before starting Prism in production")
    init_db()
    yield


app = FastAPI(title="Prism Study API", version="1.0.0", lifespan=lifespan)
allowed_origins = [origin.strip() for origin in os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173",
).split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if APP_ENV == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


class LoginInput(BaseModel):
    email: str = "demo@prism.study"
    name: str = "Aarav"


class SubjectInput(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    code: str = Field(default="NEW", max_length=12)
    exam_date: date | None = None


class StepInput(BaseModel):
    latex: str = Field(min_length=1, max_length=500)
    confidence: Literal["guessed", "fairly-sure", "certain"]


class DiagnosticInput(BaseModel):
    question_id: str
    answer: str


class TheoryInput(BaseModel):
    answer: str = Field(min_length=20, max_length=5000)


class PlannerInput(BaseModel):
    minutes_per_day: int = Field(ge=15, le=360)
    days: list[str]


class AskInput(BaseModel):
    question: str = Field(min_length=2, max_length=1200)
    resource_ids: list[str] = Field(default_factory=list, max_length=30)


TOPICS = [
    {"id": "separable", "name": "Separable equations", "unit": "Unit 1", "mastery": 88, "weight": 72, "x": 10, "y": 50, "status": "strong", "stage": "Foundation"},
    {"id": "homogeneous", "name": "Homogeneous DE", "unit": "Unit 1", "mastery": 71, "weight": 61, "x": 30, "y": 50, "status": "good", "stage": "Recognition"},
    {"id": "linear", "name": "First-order linear", "unit": "Unit 2", "mastery": 78, "weight": 84, "x": 50, "y": 50, "status": "good", "stage": "Core method"},
    {"id": "bernoulli", "name": "Bernoulli equation", "unit": "Unit 2", "mastery": 42, "weight": 91, "x": 70, "y": 27, "status": "focus", "stage": "Transformation"},
    {"id": "exact", "name": "Exact equations", "unit": "Unit 3", "mastery": 36, "weight": 68, "x": 90, "y": 27, "status": "focus", "stage": "Exam focus"},
    {"id": "integrating", "name": "Integrating factors", "unit": "Unit 3", "mastery": 24, "weight": 76, "x": 90, "y": 73, "status": "locked", "stage": "Exam focus"},
]
EDGES = [["separable", "homogeneous"], ["homogeneous", "linear"], ["linear", "bernoulli"], ["bernoulli", "exact"], ["linear", "integrating"], ["exact", "integrating"]]

DIAGNOSTIC = [
    {"id": "d1", "concept": "Algebra", "prompt": "Factor xÂ² + 3x + 2", "options": ["(x+1)(x+2)", "(x-1)(x-2)", "(x+3)(x+2)", "Prime"], "answer": "(x+1)(x+2)"},
    {"id": "d2", "concept": "Calculus", "prompt": "What is âˆ« 1/x dx?", "options": ["ln|x| + C", "1/xÂ² + C", "x + C", "eË£ + C"], "answer": "ln|x| + C"},
    {"id": "d3", "concept": "Recognition", "prompt": "Which form is a first-order linear DE?", "options": ["y' + P(x)y = Q(x)", "y'' + y = 0", "M dx + N dy = 0", "y = mx + c"], "answer": "y' + P(x)y = Q(x)"},
]

PROBLEMS = [
    {
        "id": "p_factor_first",
        "concept": "Separable equations",
        "marks": 4,
        "difficulty": "Exam standard",
        "prompt": r"Solve \(\frac{dy}{dx}=\frac{x+1}{x^2-1}\)",
        "source": "2024 past paper Â· Q3(a)",
        "expected": [
            ["x^2-1=(x-1)(x+1)", "x^2 - 1 = (x - 1)(x + 1)"],
            ["dy/dx=1/(x-1)", "\\frac{dy}{dx}=\\frac{1}{x-1}", "dy=1/(x-1)dx"],
            ["y=ln|x-1|+c", "y=\\ln|x-1|+c", "y=log|x-1|+c"],
        ],
        "hints": [
            "What can you do to the denominator before choosing an integration method?",
            "Factorization is the key concept here: xÂ² âˆ’ 1 is a difference of squares.",
            "Write xÂ² âˆ’ 1 = (x âˆ’ 1)(x + 1), then cancel the common factor.",
            "Full path: dy/dx = 1/(xâˆ’1), so y = ln|xâˆ’1| + C.",
        ],
        "better_method": "You chose the cleanest route: factor before integrating. It saves partial fractions and is exactly what an examiner expects.",
    },
    {
        "id": "p_bernoulli",
        "concept": "Bernoulli equation",
        "marks": 6,
        "difficulty": "Hard",
        "prompt": r"Identify the method for \(y' - \frac{2}{x}y = x y^2\)",
        "source": "Question bank Â· Unit 2",
        "expected": [
            ["bernoulli", "bernoulli equation", "n=2"],
            ["v=y^-1", "v=y^{-1}", "z=1/y"],
        ],
        "hints": [
            "Compare the equation with y' + P(x)y = Q(x)yâ¿. What is n?",
            "This is a Bernoulli equation with n = 2.",
            "Use the substitution v = yÂ¹â»â¿ = yâ»Â¹.",
            "Full setup: v = yâ»Â¹ turns the equation into a first-order linear equation in v.",
        ],
        "better_method": "Recognizing Bernoulli immediately avoids an unproductive separation attempt. State n = 2 before substituting v = yâ»Â¹.",
    },
]

DEMO_SOURCE_TEXT = {
    "res_notes": "First-order differential equations include separable, homogeneous, linear, Bernoulli, and exact forms. For a linear equation y' + P(x)y = Q(x), the integrating factor is exp(integral P(x) dx). A Bernoulli equation y' + P(x)y = Q(x)y^n becomes linear after v = y^(1-n).",
    "res_papers": "Past papers repeatedly test equation recognition, integrating factors, Bernoulli substitution, exactness checks, and complete solutions with constants of integration. Method selection earns marks before the algebra is completed.",
    "res_scan": "Professor Rao emphasizes: classify the equation first, write the standard form, then choose the substitution or integrating factor. Check signs before integrating and state the final constant clearly.",
}


def row_dict(row: sqlite3.Row) -> dict:
    return dict(row)


def get_subject_or_404(subject_id: str, user_id: str) -> dict:
    with connect() as db:
        row = db.execußÎ7¶‰žËkºwµçM”¹Á½À ‰•áÑÉ…Ñ•‘}Ñ•áÐˆ°9½¹”¤(€€€€€€€ÍÑ…Ñ”€ôÉ½Ý}‘¥Ð¡‘ˆ¹•á•ÕÑ” ‰M1P€¨I=4ÍÕ‰©•Ñ}ÍÑ…Ñ”]!IÍÕ‰©•Ñ}¥€ô€üˆ°€¡ÍÕ‰©•Ñ}¥°¤¤¹™•Ñ¡½¹” ¤¤(€€€É•ÑÕÉ¸ì‰ÍÕ‰©•ÐˆèÍÕ‰©•Ð°€‰É•Í½ÕÉ•ÌˆèÉ•Í½ÕÉ•Ì°€‰ÍÑ…Ñ”ˆèÍÑ…Ñ•ô(()…ÁÀ¹Á½ÍÐ ˆ½…Á¤½ÍÕ‰©•ÑÌ½íÍÕ‰©•Ñ}¥‘ô½…Í¬ˆ¤)‘•˜…Í­}Í½ÕÉ•Ì¡ÍÕ‰©•Ñ}¥èÍÑÈ°Á…å±½…èÍ­%¹ÁÕÐ°ÕÍ•Èè‘¥Ð€ô•Á•¹‘Ì¡É•ÅÕ¥É•}ÕÍ•È¤¤€´ø‘¥Ðè(€€€•Ñ}ÍÕ‰©•Ñ}½É|ÐÀÐ¡ÍÕ‰©•Ñ}¥°ÕÍ•Él‰¥‰t¤(€€€Í½ÕÉ•Ì€ôÍ½ÕÉ•}½¹Ñ•áÐ¡ÍÕ‰©•Ñ}¥°Á…å±½…¹É•Í½ÕÉ•}¥‘Ì¤(€€€¥˜¹½ÐÍ½ÕÉ•Ìè(€€€€€€€É…¥Í”!QQAá•ÁÑ¥½¸ ÐÀÀ°€‰M•±•Ð…Ð±•…ÍÐ½¹”Í½ÕÉ”Ý¥Ñ É•…‘…‰±”Ñ•áÐˆ¤(€€€•¹•É…Ñ•€ôÍÑÕ‘å}…•¹Ð¹…¹ÍÝ•É}Í½ÕÉ•Ì¡Á…å±½…¹ÅÕ•ÍÑ¥½¸¹ÍÑÉ¥À ¤°Í½ÕÉ•Ì¤(€€€É•ÍÕ±Ð€ô•¹•É…Ñ•½È™…±±‰…­}…¹ÍÝ•È¡Á…å±½…¹ÅÕ•ÍÑ¥½¸°Í½ÕÉ•Ì¤(€€€É•ÍÕ±Ñl‰…¤‰t€ôÍÑÕ‘å}…•¹Ð¹ÍÑ…ÑÕÌ ‰±¥Ù”ˆ¥˜•¹•É…Ñ••±Í”€‰™…±±‰…¬ˆ¤(€€€É•ÍÕ±Ñl‰Í½ÕÉ•}½Õ¹Ð‰t€ô±•¸¡Í½ÕÉ•Ì¤(€€€É•ÑÕÉ¸É•ÍÕ±Ð(()…ÁÀ¹Á½ÍÐ ˆ½…Á¤½ÍÕ‰©•ÑÌ½íÍÕ‰©•Ñ}¥‘ô½ÍÑÕ‘¥¼½í­¥¹‘ôˆ¤)‘•˜É•…Ñ•}ÍÑÕ‘¥½}…ÉÑ¥™…Ð¡ÍÕ‰©•Ñ}¥èÍÑÈ°­¥¹èÍÑÈ°Á…å±½…èÍ­%¹ÁÕÐ°ÕÍ•Èè‘¥Ð€ô•Á•¹‘Ì¡É•ÅÕ¥É•}ÕÍ•È¤¤€´ø‘¥Ðè(€€€ÍÕ‰©•Ð€ô•Ñ}ÍÕ‰©•Ñ}½É|ÐÀÐ¡ÍÕ‰©•Ñ}¥°ÕÍ•Él‰¥‰t¤(€€€¥˜­¥¹¹½Ð¥¸ì‰ÍÑÕ‘äµÕ¥‘”ˆ°€‰™±…Í¡…É‘Ìˆ°€‰ÅÕ¥è‰ôè(€€€€€€€É…¥Í”!QQAá•ÁÑ¥½¸ ÐÀÐ°€‰MÑÕ‘¥¼Ñ½½°¹½Ð™½Õ¹ˆ¤(€€€Í½ÕÉ•Ì€ôÍ½ÕÉ•}½¹Ñ•áÐ¡ÍÕ‰©•Ñ}¥°Á…å±½…¹É•Í½ÕÉ•}¥‘Ì¤(€€€¥˜¹½ÐÍ½ÕÉ•Ìè(€€€€€€€É…¥Í”!QQAá•ÁÑ¥½¸ ÐÀÀ°€‰M•±•Ð…Ð±•…ÍÐ½¹”Í½ÕÉ”Ý¥Ñ É•…‘…‰±”Ñ•áÐˆ¤(€€€Í½ÕÉ•}Ñ•áÐ€ô€‰q¹q¸ˆ¹©½¥¸¡˜‰M=UIèíÍ½ÕÉ•l¹…µ”uõq¹íÍ½ÕÉ•lÑ•áÐuôˆ™½ÈÍ½ÕÉ”¥¸Í½ÕÉ•Ì¥lèØÀÀÀÁt(€€€•¹•É…Ñ•€ôÍÑÕ‘å}…•¹Ð¹ÍÑÕ‘¥½}…ÉÑ¥™…Ð¡­¥¹°ÍÕ‰©•Ñl‰¹…µ”‰t°Í½ÕÉ•}Ñ•áÐ¤(€€€…ÉÑ¥™…Ð€ô•¹•É…Ñ•½È™…±±‰…­}…ÉÑ¥™…Ð¡­¥¹¤(€€€É•ÑÕÉ¸ì(€€€€€€€€‰­¥¹ˆè­¥¹°(€€€€€€€€‰…ÉÑ¥™…Ðˆè…ÉÑ¥™…Ð°(€€€€€€€€‰…¤ˆèÍÑÕ‘å}…•¹Ð¹ÍÑ…ÑÕÌ ‰±¥Ù”ˆ¥˜•¹•É…Ñ••±Í”€‰™…±±‰…¬ˆ¤°(€€€€€€€€‰Í½ÕÉ•}½Õ¹Ðˆè±•¸¡Í½ÕÉ•Ì¤°(€€€ô(()…ÁÀ¹Á½ÍÐ ˆ½…Á¤½ÍÕ‰©•ÑÌˆ°ÍÑ…ÑÕÍ}½‘”ôÈÀÄ¤)‘•˜É•…Ñ•}ÍÕ‰©•Ð¡Á…å±½…èMÕ‰©•Ñ%¹ÁÕÐ°ÕÍ•Èè‘¥Ð€ô•Á•¹‘Ì¡É•ÅÕ¥É•}ÕÍ•È¤¤€´ø‘¥Ðè(€€€ÍÕ‰©•Ñ}¥€ôÕ¥ ‰ÍÕˆˆ¤(€€€Ý¥Ñ ½¹¹•Ð ¤…Ì‘ˆè(€€€€€€€‘ˆ¹•á•ÕÑ” (€€€€€€€€€€€€‰%9MIP%9Q<ÍÕ‰©•ÑÌY1UL€ ü°€ü°€ü°€ü°€ü°€ü°€ü°€ü¤ˆ°(€€€€€€€€€€€€¡ÍÕ‰©•Ñ}¥°ÕÍ•Él‰¥‰t°Á…å±½…¹¹…µ”¹ÍÑÉ¥À ¤°Á…å±½…¹½‘”¹ÕÁÁ•È ¤°Á…å±½…¹•á…µ}‘…Ñ”¹¥Í½™½Éµ…Ð ¤¥˜Á…å±½…¹•á…µ}‘…Ñ”•±Í”9½¹”°€ˆŒÌÜÔÕÔˆ°€À°ÕÑ}¹½Ü ¤¤°(€€€€€€€€¤(€€€€€€€‘ˆ¹•á•ÕÑ” ‰%9MIP%9Q<ÍÕ‰©•Ñ}ÍÑ…Ñ”Y1UL€ ü°€À°€À°€À¤ˆ°€¡ÍÕ‰©•Ñ}¥°¤¤(€€€€€€€‘ˆ¹½µµ¥Ð ¤(€€€É•ÑÕÉ¸ì‰¥ˆèÍÕ‰©•Ñ}¥°€‰¹…µ”ˆèÁ…å±½…¹¹…µ”°€‰½‘”ˆèÁ…å±½…¹½‘”¹ÕÁÁ•È ¥ô(()…ÁÀ¹Á½ÍÐ ˆ½…Á¤½ÍÕ‰©•ÑÌ½íÍÕ‰©•Ñ}¥‘ô½É•Í½ÕÉ•Ìˆ°ÍÑ…ÑÕÍ}½‘”ôÈÀÈ¤)…Íå¹Œ‘•˜ÕÁ±½…‘}É•Í½ÕÉ”¡ÍÕ‰©•Ñ}¥èÍÑÈ°‰…­É½Õ¹è	…­É½Õ¹‘Q…Í­Ì°™¥±”èUÁ±½…‘¥±”€ô¥±” ¸¸¸¤°ÕÍ•Èè‘¥Ð€ô•Á•¹‘Ì¡É•ÅÕ¥É•}ÕÍ•È¤¤€´ø‘¥Ðè(€€€•Ñ}ÍÕ‰©•Ñ}½É|ÐÀÐ¡ÍÕ‰©•Ñ}¥°ÕÍ•Él‰¥‰t¤(€€€ÍÕ™™¥à€ôA…Ñ ¡™¥±”¹™¥±•¹…µ”½È€‰É•Í½ÕÉ”ˆ¤¹ÍÕ™™¥à¹±½Ý•È ¤(€€€¥˜ÍÕ™™¥à¹½Ð¥¸ìˆ¹Á‘˜ˆ°€ˆ¹Á¹œˆ°€ˆ¹©Áœˆ°€ˆ¹©Á•œˆ°€ˆ¹ÑáÐˆ°€ˆ¹‘½à‰ôè(€€€€€€€É…¥Í”!QQAá•ÁÑ¥½¸ ÐÄÔ°€‰UÁ±½…„A°¥µ…”°Ñ•áÐ°½È=`™¥±”ˆ¤(€€€½¹Ñ•¹ÑÌ€ô…Ý…¥Ð™¥±”¹É•… ¤(€€€¥˜±•¸¡½¹Ñ•¹ÑÌ¤€ø€ÈÔ€¨€ÄÀÈÐ€¨€ÄÀÈÐè(€€€€€€€É…¥Í”!QQAá•ÁÑ¥½¸ ÐÄÌ°€‰¥±”µÕÍÐ‰”Õ¹‘•È€ÈÔ5ˆ¤(€€€É•Í½ÕÉ•}¥€ôÕ¥ ‰É•Ìˆ¤(€€€™¥±•}Á…Ñ €ôUA1=}%H€¼˜‰íÉ•Í½ÕÉ•}¥‘õíÍÕ™™¥áôˆ(€€€™¥±•}Á…Ñ ¹ÝÉ¥Ñ•}‰åÑ•Ì¡½¹Ñ•¹ÑÌ¤(€€€­¥¹€ô€‰A¡½Ñ¼ˆ¥˜€¡™¥±”¹½¹Ñ•¹Ñ}ÑåÁ”½È€ˆˆ¤¹ÍÑ…ÉÑÍÝ¥Ñ  ‰¥µ…”¼ˆ¤•±Í”€‰MÑÕ‘äµ…Ñ•É¥…°ˆ(€€€Ý¥Ñ ½¹¹•Ð ¤…Ì‘ˆè(€€€€€€€‘ˆ¹•á•ÕÑ” (€€€€€€€€€€€€ˆˆ‰%9MIP%9Q<É•Í½ÕÉ•Ì(€€€€€€€€€€€€€€€¡¥°ÍÕ‰©•Ñ}¥°¹…µ”°­¥¹°Í¥é”°ÍÑ…ÑÕÌ°‘•Ñ…¥°°Á…•Ì°É•…Ñ•‘}…Ð¤(€€€€€€€€€€€€€€Y1UL€ ü°€ü°€ü°€ü°€ü°€ü°€ü°€ü°€ü¤ˆˆˆ°(€€€€€€€€€€€€¡É•Í½ÕÉ•}¥°ÍÕ‰©•Ñ}¥°™¥±”¹™¥±•¹…µ”½È€‰U¹Ñ¥Ñ±•É•Í½ÕÉ”ˆ°­¥¹°±•¸¡½¹Ñ•¹ÑÌ¤°€‰ÁÉ½•ÍÍ¥¹œˆ°€‰A…ÉÍ¥¹œ¥¸Ñ¡”‰…­É½Õ¹ˆ°€À°ÕÑ}¹½Ü ¤¤°(€€€€€€€€¤(€€€€€€€‘ˆ¹½µµ¥Ð ¤(€€€‰…­É½Õ¹¹…‘‘}Ñ…Í¬¡ÁÉ½•ÍÍ}É•Í½ÕÉ”°É•Í½ÕÉ•}¥°™¥±•}Á…Ñ °™¥±”¹½¹Ñ•¹Ñ}ÑåÁ”¤(€€€É•ÑÕÉ¸ì‰¥ˆèÉ•Í½ÕÉ•}¥°€‰ÍÑ…ÑÕÌˆè€‰ÁÉ½•ÍÍ¥¹œˆ°€‰¹…µ”ˆè™¥±”¹™¥±•¹…µ•ô(()…ÁÀ¹•Ð ˆ½…Á¤½ÍÕ‰©•ÑÌ½íÍÕ‰©•Ñ}¥‘ô½µ…Àˆ¤)‘•˜ÕÉÉ¥Õ±Õµ}µ…À¡ÍÕ‰©•Ñ}¥èÍÑÈ°ÕÍ•Èè‘¥Ð€ô•Á•¹‘Ì¡É•ÅÕ¥É•}ÕÍ•È¤¤€´ø‘¥Ðè(€€€•Ñ}ÍÕ‰©•Ñ}½É|ÐÀÐ¡ÍÕ‰©•Ñ}¥°ÕÍ•Él‰¥‰t¤(€€€Ý¥Ñ ½¹¹•Ð ¤…Ì‘ˆè(€€€€€€€µ…Á}É½Ü€ô‘ˆ¹•á•ÕÑ” ‰M1P€¨I=4ÍÕ‰©•Ñ}µ…ÁÌ]!IÍÕ‰©•Ñ}¥€ô€üˆ°€¡ÍÕ‰©•Ñ}¥°¤¤¹™•Ñ¡½¹” ¤(€€€€€€€Í½ÕÉ•}½Õ¹Ð€ô‘ˆ¹•á•ÕÑ” ‰M1P=U9P ¨¤I=4É•Í½ÕÉ•Ì]!IÍÕ‰©•Ñ}¥€ô€üˆ°€¡ÍÕ‰©•Ñ}¥°¤¤¹™•Ñ¡½¹” ¥lÁt(€€€¥˜µ…Á}É½Ü…¹µ…Á}É½Ýl‰É…Á¡}©Í½¸‰tè(€€€€€€€É…Á €ô©Í½¸¹±½…‘Ì¡µ…Á}É½Ýl‰É…Á¡}©Í½¸‰t¤(€€€€€€€É…Á ¹ÕÁ‘…Ñ”¡ì(€€€€€€€€€€€€‰Í½ÕÉ•}½Õ¹ÐˆèÍ½ÕÉ•}½Õ¹Ð°(€€€€€€€€€€€€‰ÕÁ‘…Ñ•‘}…Ðˆèµ…Á}É½Ýl‰ÕÁ‘…Ñ•‘}…Ð‰t°(€€€€€€€€€€€€‰…¤ˆèÍÑÕ‘å}…•¹Ð¹ÍÑ…ÑÕÌ ‰±¥Ù”ˆ¥˜µ…Á}É½Ýl‰ÍÑ…ÑÕÌ‰t€ôô€‰É•…‘äˆ•±Í”µ…Á}É½Ýl‰ÍÑ…ÑÕÌ‰t¤°(€€€€€€€ô¤(€€€€€€€É•ÑÕÉ¸É…Á (€€€µ½‘”€ôµ…Á}É½Ýl‰ÍÑ…ÑÕÌ‰t¥˜µ…Á}É½Ü•±Í”€‰™…±±‰…¬ˆ(€€€É•ÑÕÉ¸ì(€€€€€€€€‰Ñ½Á¥ÌˆèQ=A%L°(€€€€€€€€‰•‘•ÌˆèL°(€€€€€€€€‰½Ù•É…”ˆè€àÈ°(€€€€€€€€‰…ÁÌˆèl‰M•½¹µ½É‘•È±¥¹•…È•ÅÕ…Ñ¥½¹Ì‰t°(€€€€€€€€‰Í½ÕÉ•}½Õ¹ÐˆèÍ½ÕÉ•}½Õ¹Ð°(€€€€€€€€‰ÕÁ‘…Ñ•‘}…Ðˆè9½¹”°(€€€€€€€€‰…¤ˆèÍÑÕ‘å}…•¹Ð¹ÍÑ…ÑÕÌ¡µ½‘”¤°(€€€ô(()…ÁÀ¹•Ð ˆ½…Á¤½ÍÕ‰©•ÑÌ½íÍÕ‰©•Ñ}¥‘ô½‘¥…¹½ÍÑ¥Œˆ¤)‘•˜‘¥…¹½ÍÑ¥Œ¡ÍÕ‰©•Ñ}¥èÍÑÈ°ÕÍ•Èè‘¥Ð€ô•Á•¹‘Ì¡É•ÅÕ¥É•}ÕÍ•È¤¤€´ø‘¥Ðè(€€€•Ñ}ÍÕ‰©•Ñ}½É|ÐÀÐ¡ÍÕ‰©•Ñ}¥°ÕÍ•Él‰¥‰t¤(€€€Ý¥Ñ ½¹¹•Ð ¤…Ì‘ˆè(€€€€€€€…¹ÍÝ•É•€ôíÉ½ÝlÁt™½ÈÉ½Ü¥¸‘ˆ¹•á•ÕÑ” ‰M1PÅÕ•ÍÑ¥½¹}¥I=4‘¥…¹½ÍÑ¥}…¹ÍÝ•ÉÌ]!IÍÕ‰©•Ñ}¥€ô€üˆ°€¡ÍÕ‰©•Ñ}¥°¤¥ô(€€€ÅÕ•ÍÑ¥½¹Ì€ômí¬èØ™½È¬°Ø¥¸ÅÕ•ÍÑ¥½¸¹¥Ñ•µÌ ¤¥˜¬€„ô€‰…¹ÍÝ•È‰ô™½ÈÅÕ•ÍÑ¥½¸¥¸%9=MQ%¥˜ÅÕ•ÍÑ¥½¹l‰¥‰t¹½Ð¥¸…¹ÍÝ•É•‘t(€€€É•ÑÕÉ¸ì‰ÅÕ•ÍÑ¥½¹ÌˆèÅÕ•ÍÑ¥½¹Ì°€‰…¹ÍÝ•É•ˆè±•¸¡…¹ÍÝ•É•¤°€‰Ñ½Ñ…°ˆè±•¸¡%9=MQ%¥ô(()…ÁÀ¹Á½ÍÐ ˆ½…Á¤½ÍÕ‰©•ÑÌ½íÍÕ‰©•Ñ}¥‘ô½‘¥…¹½ÍÑ¥Œˆ¤)‘•˜…¹ÍÝ•É}‘¥…¹½ÍÑ¥Œ¡ÍÕ‰©•Ñ}¥èÍÑÈ°Á…å±½…è¥…¹½ÍÑ¥%¹ÁÕÐ°ÕÍ•Èè‘¥Ð€ô•Á•¹‘Ì¡É•ÅÕ¥É•}ÕÍ•È¤¤€´ø‘¥Ðè(€€€•Ñ}ÍÕ‰©•Ñ}½É|ÐÀÐ¡ÍÕ‰©•Ñ}¥°ÕÍ•Él‰¥‰t¤(€€€ÅÕ•ÍÑ¥½¸€ô¹•áÐ ¡¥Ñ•´™½È¥Ñ•´¥¸%9=MQ%¥˜¥Ñ•µl‰¥‰t€ôôÁ…å±½…¹ÅÕ•ÍÑ¥½¹}¥¤°9½¹”¤(€€€¥˜¹½ÐÅÕ•ÍÑ¥½¸è(€€€€€€€É…¥Í”!QQAá•ÁÑ¥½¸ ÐÀÐ°€‰EÕ•ÍÑ¥½¸¹½Ð™½Õ¹ˆ¤(€€€½ÉÉ•Ð€ôÁ…å±½…¹…¹ÍÝ•È€ôôÅÕ•ÍÑ¥½¹l‰…¹ÍÝ•È‰t(€€€Ý¥Ñ ½¹¹•Ð ¤…Ì‘ˆè(€€€€€€€‘ˆ¹•á•ÕÑ” (€€€€€€€€€€€€‰%9MIP%9Q<‘¥…¹½ÍÑ¥}…¹ÍÝ•ÉÌY1UL€ ü°€ü°€ü°€ü°€ü°€ü¤ˆ°(€€€€€€€€€€€€¡Õ¥ ‰‘¥…œˆ¤°ÍÕ‰©•Ñ}¥°Á…å±½…¹ÅÕ•ÍÑ¥½¹}¥°Á…å±½…¹…¹ÍÝ•È°¥¹Ð¡½ÉÉ•Ð¤°ÕÑ}¹½Ü ¤¤°(€€€€€€€€¤(€€€€€€€…¹ÍÝ•É•€ô‘ˆ¹•á•ÕÑ” ‰M1P=U9P ¨¤I=4‘¥…¹½ÍÑ¥}…¹ÍÝ•ÉÌ]!IÍÕ‰©•Ñ}¥€ô€üˆ°€¡ÍÕ‰©•Ñ}¥°¤¤¹™•Ñ¡½¹” ¥lÁt(€€€€€€€¥˜…¹ÍÝ•É•€øô±•¸¡%9=MQ%¤è(€€€€€€€€€€€‘ˆ¹•á•ÕÑ” ‰UAQÍÕ‰©•Ñ}ÍÑ…Ñ”MP‘¥…¹½ÍÑ¥}½µÁ±•Ñ”€ô€Ä]!IÍÕ‰©•Ñ}¥€ô€üˆ°€¡ÍÕ‰©•Ñ}¥°¤¤(€€€€€€€‘ˆ¹½µµ¥Ð ¤(€€€É•ÑÕÉ¸ì‰½ÉÉ•Ðˆè½ÉÉ•Ð°€‰•áÁ±…¹…Ñ¥½¸ˆè€‰½½™½Õ¹‘…Ñ¥½¸¸ˆ¥˜½ÉÉ•Ð•±Í”˜‰Q¡”•áÁ•Ñ•…¹ÍÝ•È¥ÌíÅÕ•ÍÑ¥½¹l…¹ÍÝ•Èuô¸ˆ°€‰½µÁ±•Ñ”ˆè…¹ÍÝ•É•€øô±•¸¡%9=MQ%¥ô(()…ÁÀ¹•Ð ˆ½…Á¤½ÍÕ‰©•ÑÌ½íÍÕ‰©•Ñ}¥‘ô½ÁÉ…Ñ¥”ˆ¤)‘•˜ÕÉÉ•¹Ñ}ÁÉ…Ñ¥”¡ÍÕ‰©•Ñ}¥èÍÑÈ°ÕÍ•Èè‘¥Ð€ô•Á•¹‘Ì¡É•ÅÕ¥É•}ÕÍ•È¤¤€´ø‘¥Ðè(€€€•Ñ}ÍÕ‰©•Ñ}½É|ÐÀÐ¡ÍÕ‰©•Ñ}¥°ÕÍ•Él‰¥‰t¤(€€€Ý¥Ñ ½¹¹•Ð ¤…Ì‘ˆè(€€€€€€€ÍÑ…Ñ”€ô‘ˆ¹•á•ÕÑ” ‰M1P€¨I=4ÍÕ‰©•Ñ}ÍÑ…Ñ”]!IÍÕ‰©•Ñ}¥€ô€üˆ°€¡ÍÕ‰©•Ñ}¥°¤¤¹™•Ñ¡½¹” ¤(€€€€€€€…ÑÑ•µÁÑÌ€ômÉ½Ý}‘¥Ð¡É½Ü¤™½ÈÉ½Ü¥¸‘ˆ¹•á•ÕÑ” ‰M1P€¨I=4…ÑÑ•µÁÑÌ]!IÍÕ‰©•Ñ}¥€ô€ü9ÁÉ½‰±•µ}¥€ô€ü=IH	dÉ•…Ñ•‘}…Ðˆ°€¡ÍÕ‰©•Ñ}¥°AI=	15MmÍÑ…Ñ•lÁÉ½‰±•µ}¥¹‘•àuul‰¥‰t¤¥t(€€€ÁÉ½‰±•´€ôí¬èØ™½È¬°Ø¥¸AI=	15MmÍÑ…Ñ•l‰ÁÉ½‰±•µ}¥¹‘•à‰ut¹¥Ñ•µÌ ¤¥˜¬¹½Ð¥¸ì‰•áÁ•Ñ•ˆ°€‰¡¥¹ÑÌ‰õô(€€€É•ÑÕÉ¸ì(€€€€€€€€‰ÁÉ½‰±•´ˆèÁÉ½‰±•´°(€€€€€€€€‰…ÑÑ•µÁÑÌˆè…ÑÑ•µÁÑÌ°(€€€€€€€€‰¡¥¹Ñ}±•Ù•°ˆèÍÑ…Ñ•l‰¡¥¹Ñ}±•Ù•°‰t°(€€€€€€€€‰Ñ•…¡•É}ÍÑ…Ñ”ˆè€‰Í¥±•¹Ðˆ°(€€€€€€€€‰…¤ˆèÍÑÕ‘å}…•¹Ð¹ÍÑ…ÑÕÌ ¤°(€€€ô(()…ÁÀ¹Á½ÍÐ ˆ½…Á¤½ÍÕ‰©•ÑÌ½íÍÕ‰©•Ñ}¥‘ô½ÁÉ…Ñ¥”½íÁÉ½‰±•µ}¥‘ô½ÍÑ•ÁÌˆ¤)‘•˜ÍÕ‰µ¥Ñ}ÍÑ•À¡ÍÕ‰©•Ñ}¥èÍÑÈ°ÁÉ½‰±•µ}¥èÍÑÈ°Á…å±½…èMÑ•Á%¹ÁÕÐ°ÕÍ•Èè‘¥Ð€ô•Á•¹‘Ì¡É•ÅÕ¥É•}ÕÍ•È¤¤€´ø‘¥Ðè(€€€•Ñ}ÍÕ‰©•Ñ}½É|ÐÀÐ¡ÍÕ‰©•Ñ}¥°ÕÍ•Él‰¥‰t¤(€€€ÁÉ½‰±•´€ô¹•áÐ ¡¥Ñ•´™½È¥Ñ•´¥¸AI=	15L¥˜¥Ñ•µl‰¥‰t€ôôÁÉ½‰±•µ}¥¤°9½¹”¤(€€€¥˜¹½ÐÁÉ½‰±•´è(€€€€€€€É…¥Í”!QQAá•ÁÑ¥½¸ ÐÀÐ°€‰AÉ½‰±•´¹½Ð™½Õ¹ˆ¤(€€€Ý¥Ñ ½¹¹•Ð ¤…Ì‘ˆè(€€€€€€€ÍÑ•Á}¥¹‘•à€ô‘ˆ¹•á•ÕÑ” ‰M1P=U9P ¨¤I=4…ÑÑ•µÁÑÌ]!IÍÕ‰©•Ñ}¥€ô€ü9ÁÉ½‰±•µ}¥€ô€ü9½ÉÉ•Ð€ô€Äˆ°€¡ÍÕ‰©•Ñ}¥°ÁÉ½‰±•µ}¥¤¤¹™•Ñ¡½¹” ¥lÁt(€€€€€€€½ÉÉ•Ð°•ÉÉ½É}ÑåÁ”€ô•Ù…±Õ…Ñ•}ÍÑ•À¡ÁÉ½‰±•´°ÍÑ•Á}¥¹‘•à°Á…å±½…¹±…Ñ•à¤(€€€€€€€ÍÑ…Ñ”€ô‘ˆ¹•á•ÕÑ” ‰M1P¡¥¹Ñ}±•Ù•°I=4ÍÕ‰©•Ñ}ÍÑ…Ñ”]!IÍÕ‰©•Ñ}¥€ô€üˆ°€¡ÍÕ‰©•Ñ}¥°¤¤¹™•Ñ¡½¹” ¤(€€€€€€€‘ˆ¹•á•ÕÑ” (€€€€€€€€€€€€‰%9MIP%9Q<…ÑÑ•µÁÑÌY1UL€ ü°€ü°€ü°€ü°€ü°€ü°€ü°€ü°€ü°€ü¤ˆ°(€€€€€€€€€€€€¡Õ¥ ‰…ÑÐˆ¤°ÍÕ‰©•Ñ}¥°ÁÉ½‰±•µ}¥°ÍÑ•Á}¥¹‘•à°Á…å±½…¹±…Ñ•à°Á…å±½…¹½¹™¥‘•¹”°¥¹Ð¡½ÉÉ•Ð¤°•ÉÉ½É}ÑåÁ”°ÍÑ…Ñ•lÁt°ÕÑ}¹½Ü ¤¤°(€€€€€€€€¤(€€€€€€€‘ˆ¹½µµ¥Ð ¤(€€€€€€€…ÑÑ•µÁÑÌ€ôl(€€€€€€€€€€€É½Ý}‘¥Ð¡É½Ü¤(€€€€€€€€€€€™½ÈÉ½Ü¥¸‘ˆ¹•á•ÕÑ” (€€€€€€€€€€€€€€€€‰M1P€¨I=4…ÑÑ•µÁÑÌ]!IÍÕ‰©•Ñ}¥€ô€ü9ÁÉ½‰±•µ}¥€ô€ü=IH	dÉ•…Ñ•‘}…Ðˆ°(€€€€€€€€€€€€€€€€¡ÍÕ‰©•Ñ}¥°ÁÉ½‰±•µ}¥¤°(€€€€€€€€€€€€¤(€€€€€€€t(€€€Í½±Ù•€ô½ÉÉ•Ð…¹ÍÑ•Á}¥¹‘•à€¬€Ä€øô±•¸¡ÁÉ½‰±•µl‰•áÁ•Ñ•‰t¤(€€€‰•ÑÑ•É}µ•Ñ¡½€ô9½¹”(€€€…¥}µ½‘”€ô€‰™…±±‰…¬ˆ(€€€¥˜Í½±Ù•è(€€€€€€€‰•ÑÑ•É}µ•Ñ¡½€ôÍÑÕ‘å}…•¹Ð¹‰•ÑÑ•É}µ•Ñ¡½¡ÁÉ½‰±•´°…ÑÑ•µÁÑÌ¤(€€€€€€€¥˜‰•ÑÑ•É}µ•Ñ¡½è(€€€€€€€€€€€…¥}µ½‘”€ô€‰±¥Ù”ˆ(€€€€€€€•±Í”è(€€€€€€€€€€€‰•ÑÑ•É}µ•Ñ¡½€ôÁÉ½‰±•µl‰‰•ÑÑ•É}µ•Ñ¡½‰t(€€€É•ÑÕÉ¸ì(€€€€€€€€‰½ÉÉ•Ðˆè½ÉÉ•Ð°(€€€€€€€€‰Í¥±•¹Ðˆè½ÉÉ•Ð…¹¹½ÐÍ½±Ù•°(€€€€€€€€‰Í½±Ù•ˆèÍ½±Ù•°(€€€€€€€€‰ÍÑ•Á}¥¹‘•àˆèÍÑ•Á}¥¹‘•à°(€€€€€€€€‰•ÉÉ½É}ÑåÁ”ˆè•ÉÉ½É}ÑåÁ”°(€€€€€€€€‰µ•ÍÍ…”ˆè€‰MÑ•À…•ÁÑ•ˆ¥˜½ÉÉ•Ð•±Í”€‰Q¡…ÐÍÑ•À¡…¹•ÌÑ¡”Á…Ñ ¸¡•¬Ñ¡”…±•‰É„‰•™½É”½¹Ñ¥¹Õ¥¹œ¸ˆ°(€€€€€€€€‰‰•ÑÑ•É}µ•Ñ¡½ˆè‰•ÑÑ•É}µ•Ñ¡½°(€€€€€€€€‰…¤ˆèÍÑÕ‘å}…•¹Ð¹ÍÑ…ÑÕÌ¡…¥}µ½‘”¤°(€€€ô(()…ÁÀ¹Á½ÍÐ ˆ½…Á¤½ÍÕ‰©•ÑÌ½íÍÕ‰©•Ñ}¥‘ô½ÁÉ…Ñ¥”½íÁÉ½‰±•µ}¥‘ô½¡¥¹Ðˆ¤)‘•˜¹•áÑ}¡¥¹Ð¡ÍÕ‰©•Ñ}¥èÍÑÈ°ÁÉ½‰±•µ}¥èÍÑÈ°ÕÍ•Èè‘¥Ð€ô•Á•¹‘Ì¡É•ÅÕ¥É•}ÕÍ•È¤¤€´ø‘¥Ðè(€€€•Ñ}ÍÕ‰©•Ñ}½É|ÐÀÐ¡ÍÕ‰©•Ñ}¥°ÕÍ•Él‰¥‰t¤(€€€ÁÉ½‰±•´€ô¹•áÐ ¡¥Ñ•´™½È¥Ñ•´¥¸AI=	15L¥˜¥Ñ•µl‰¥‰t€ôôÁÉ½‰±•µ}¥¤°9½¹”¤(€€€¥˜¹½ÐÁÉ½‰±•´è(€€€€€€€É…¥Í”!QQAá•ÁÑ¥½¸ ÐÀÐ°€‰AÉ½‰±•´¹½Ð™½Õ¹ˆ¤(€€€Ý¥Ñ ½¹¹•Ð ¤…Ì‘ˆè(€€€€€€€ÍÑ…Ñ”€ô‘ˆ¹•á•ÕÑ” ‰M1P¡¥¹Ñ}±•Ù•°I=4ÍÕ‰©•Ñ}ÍÑ…Ñ”]!IÍÕ‰©•Ñ}¥€ô€üˆ°€¡ÍÕ‰©•Ñ}¥°¤¤¹™•Ñ¡½¹” ¤(€€€€€€€±•Ù•°€ôµ¥¸¡ÍÑ…Ñ•lÁt€¬€Ä°±•¸¡ÁÉ½‰±•µl‰¡¥¹ÑÌ‰t¤¤(€€€€€€€‘ˆ¹•á•ÕÑ” ‰UAQÍÕ‰©•Ñ}ÍÑ…Ñ”MP¡¥¹Ñ}±•Ù•°€ô€ü]!IÍÕ‰©•Ñ}¥€ô€üˆ°€¡±•Ù•°°ÍÕ‰©•Ñ}¥¤¤(€€€€€€€‘ˆ¹½µµ¥Ð ¤(€€€€€€€…ÑÑ•µÁÑÌ€ôl(€€€€€€€€€€€É½Ý}‘¥Ð¡É½Ü¤(€€€€€€€€€€€™½ÈÉ½Ü¥¸‘ˆ¹•á•ÕÑ” (€€€€€€€€€€€€€€€€‰M1P€¨I=4…ÑÑ•µÁÑÌ]!IÍÕ‰©•Ñ}¥€ô€ü9ÁÉ½‰±•µ}¥€ô€ü=IH	dÉ•…Ñ•‘}…Ðˆ°(€€€€€€€€€€€€€€€€¡ÍÕ‰©•Ñ}¥°ÁÉ½‰±•µ}¥¤°(€€€€€€€€€€€€¤(€€€€€€€t(€€€€€€€ÍÑ•Á}¥¹‘•à€ô‘ˆ¹•á•ÕÑ” (€€€€€€€€€€€€‰M1P=U9P ¨¤I=4…ÑÑ•µÁÑÌ]!IÍÕ‰©•Ñ}¥€ô€ü9ÁÉ½‰±•µ}¥€ô€ü9½ÉÉ•Ð€ô€Äˆ°(€€€€€€€€€€€€¡ÍÕ‰©•Ñ}¥°ÁÉ½‰±•µ}¥¤°(€€€€€€€€¤¹™•Ñ¡½¹” ¥lÁt(€€€±…‰•±Ì€ôl‰A½¥¹Ñ•ÅÕ•ÍÑ¥½¸ˆ°€‰½¹•ÁÐ¹Õ‘”ˆ°€‰A…ÉÑ¥…°ÍÑ•Àˆ°€‰Õ±°Í½±ÕÑ¥½¸‰t(€€€•¹•É…Ñ•€ôÍÑÕ‘å}…•¹Ð¹¡¥¹Ð¡ÁÉ½‰±•´°ÍÑ•Á}¥¹‘•à°…ÑÑ•µÁÑÌ°±•Ù•°¤(€€€É•ÑÕÉ¸ì(€€€€€€€€‰±•Ù•°ˆè±•Ù•°°(€€€€€€€€‰±…‰•°ˆè•¹•É…Ñ•‘l‰±…‰•°‰t¥˜•¹•É…Ñ••±Í”±…‰•±Ím±•Ù•°€´€Åt°(€€€€€€€€‰¡¥¹Ðˆè•¹•É…Ñ•‘l‰¡¥¹Ð‰t¥˜•¹•É…Ñ••±Í”ÁÉ½‰±•µl‰¡¥¹ÑÌ‰um±•Ù•°€´€Åt°(€€€€€€€€‰¥Í}É•Ù•…°ˆè±•Ù•°€ôô€Ð°(€€€€€€€€‰…¤ˆèÍÑÕ‘å}…•¹Ð¹ÍÑ…ÑÕÌ ‰±¥Ù”ˆ¥˜•¹•É…Ñ••±Í”€‰™…±±‰…¬ˆ¤°(€€€ô(()…ÁÀ¹Á½ÍÐ ˆ½…Á¤½ÍÕ‰©•ÑÌ½íÍÕ‰©•Ñ}¥‘ô½ÁÉ…Ñ¥”½¹•áÐˆ¤)‘•˜¹•áÑ}ÁÉ½‰±•´¡ÍÕ‰©•Ñ}¥èÍÑÈ°ÕÍ•Èè‘¥Ð€ô•Á•¹‘Ì¡É•ÅÕ¥É•}ÕÍ•È¤¤€´ø‘¥Ðè(€€€•Ñ}ÍÕ‰©•Ñ}½É|ÐÀÐ¡ÍÕ‰©•Ñ}¥°ÕÍ•Él‰¥‰t¤(€€€Ý¥Ñ ½¹¹•Ð ¤…Ì‘ˆè(€€€€€€€ÍÑ…Ñ”€ô‘ˆ¹•á•ÕÑ” ‰M1PÁÉ½‰±•µ}¥¹‘•àI=4ÍÕ‰©•Ñ}ÍÑ…Ñ”]!IÍÕ‰©•Ñ}¥€ô€üˆ°€¡ÍÕ‰©•Ñ}¥°¤¤¹™•Ñ¡½¹” ¤(€€€€€€€ÁÉ½‰±•µ}¥¹‘•à€ô€¡ÍÑ…Ñ•lÁt€¬€Ä¤€”±•¸¡AI=	15L¤(€€€€€€€‘ˆ¹•á•ÕÑ” ‰UAQÍÕ‰©•Ñ}ÍÑ…Ñ”MPÁÉ½‰±•µ}¥¹‘•à€ô€ü°¡¥¹Ñ}±•Ù•°€ô€À]!IÍÕ‰©•Ñ}¥€ô€üˆ°€¡ÁÉ½‰±•µ}¥¹‘•à°ÍÕ‰©•Ñ}¥¤¤(€€€€€€€‘ˆ¹½µµ¥Ð ¤(€€€É•ÑÕÉ¸ì‰ÁÉ½‰±•µ}¥ˆèAI=	15MmÁÉ½‰±•µ}¥¹‘•ául‰¥‰uô(()…ÁÀ¹Á½ÍÐ ˆ½…Á¤½ÍÕ‰©•ÑÌ½íÍÕ‰©•Ñ}¥‘ô½Ñ¡•½Éä½É…‘”ˆ¤)‘•˜É…‘•}Ñ¡•½Éä¡ÍÕ‰©•Ñ}¥èÍÑÈ°Á…å±½…èQ¡•½Éå%¹ÁÕÐ°ÕÍ•Èè‘¥Ð€ô•Á•¹‘Ì¡É•ÅÕ¥É•}ÕÍ•È¤¤€´ø‘¥Ðè(€€€•Ñ}ÍÕ‰©•Ñ}½É|ÐÀÐ¡ÍÕ‰©•Ñ}¥°ÕÍ•Él‰¥‰t¤(€€€•¹•É…Ñ•€ôÍÑÕ‘å}…•¹Ð¹É…‘•}Ñ¡•½Éä¡Á…å±½…¹…¹ÍÝ•È¤(€€€¥˜•¹•É…Ñ•è(€€€€€€€ÉÕ‰É¥Œ€ô•¹•É…Ñ•‘l‰ÉÕ‰É¥Œ‰t(€€€€€€€™••‘‰…¬€ô•¹•É…Ñ•‘l‰™••‘‰…¬‰t(€€€€€€€…¥}µ½‘”€ô€‰±¥Ù”ˆ(€€€•±Í”è(€€€€€€€…¹ÍÝ•È€ôÁ…å±½…¹…¹ÍÝ•È¹±½Ý•È ¤(€€€€€€€ÉÕ‰É¥Œ€ôl(€€€€€€€€€€€ì‰¥Ñ•´ˆè€‰•™¥¹¥Ñ¥½¸ÍÑ…Ñ•ˆ°€‰µ•Ðˆè…¹ä¡Ñ•É´¥¸…¹ÍÝ•È™½ÈÑ•É´¥¸l‰‰•É¹½Õ±±¤ˆ°€‰‘¥™™•É•¹Ñ¥…°•ÅÕ…Ñ¥½¸‰t¥ô°(€€€€€€€€€€€ì‰¥Ñ•´ˆè€‰MÑ…¹‘…É™½É´¥¹±Õ‘•ˆ°€‰µ•Ðˆè€‰À¡à¤ˆ¥¸…¹ÍÝ•È…¹€‰Ä¡à¤ˆ¥¸…¹ÍÝ•Éô°(€€€€€€€€€€€ì‰¥Ñ•´ˆè€‰MÕ‰ÍÑ¥ÑÕÑ¥½¸•áÁ±…¥¹•ˆ°€‰µ•Ðˆè…¹ä¡Ñ•É´¥¸…¹ÍÝ•È™½ÈÑ•É´¥¸l‰ÍÕ‰ÍÑ¥ÑÕÑ¥½¸ˆ°€‰Ø€ôˆ°€‰Øô‰t¥ô°(€€€€€€€€€€€ì‰¥Ñ•´ˆè€‰]½É­••á…µÁ±”ˆ°€‰µ•Ðˆè€‰•á…µÁ±”ˆ¥¸…¹ÍÝ•È½È€‰”¹œ¸ˆ¥¸…¹ÍÝ•Éô°(€€€€€€€t(€€€€€€€™••‘‰…¬€ô€‰MÑÉ½¹œÍÑÉÕÑÕÉ”¸ˆ¥˜ÍÕ´¡¥¹Ð¡¥Ñ•µl‰µ•Ð‰t¤™½È¥Ñ•´¥¸ÉÕ‰É¥Œ¤€øô€Ì•±Í”€‰‘Ñ¡”µ¥ÍÍ¥¹œÍÑÉÕÑÕÉ…°Á¥••Ì‰•™½É”Á½±¥Í¡¥¹œÑ¡”ÁÉ½Í”¸ˆ(€€€€€€€…¥}µ½‘”€ô€‰™…±±‰…¬ˆ(€€€Í½É”€ôÍÕ´¡¥¹Ð¡¥Ñ•µl‰µ•Ð‰t¤™½È¥Ñ•´¥¸ÉÕ‰É¥Œ¤(€€€É•ÑÕÉ¸ì(€€€€€€€€‰Í½É”ˆèÍ½É”°(€€€€€€€€‰Ñ½Ñ…°ˆè±•¸¡ÉÕ‰É¥Œ¤°(€€€€€€€€‰ÉÕ‰É¥ŒˆèÉÕ‰É¥Œ°(€€€€€€€€‰™••‘‰…¬ˆè™••‘‰…¬°(€€€€€€€€‰…¤ˆèÍÑÕ‘å}…•¹Ð¹ÍÑ…ÑÕÌ¡…¥}µ½‘”¤°(€€€ô(()…ÁÀ¹Á½ÍÐ ˆ½…Á¤½ÍÕ‰©•ÑÌ½íÍÕ‰©•Ñ}¥‘ô½Á±…¹¹•Èˆ¤)‘•˜ÕÁ‘…Ñ•}Á±…¹¹•È¡ÍÕ‰©•Ñ}¥èÍÑÈ°Á…å±½…èA±…¹¹•É%¹ÁÕÐ°ÕÍ•Èè‘¥Ð€ô•Á•¹‘Ì¡É•ÅÕ¥É•}ÕÍ•È¤¤€´ø‘¥Ðè(€€€•Ñ}ÍÕ‰©•Ñ}½É|ÐÀÐ¡ÍÕ‰©•Ñ}¥°ÕÍ•Él‰¥‰t¤(€€€ÍÑ…ÉÐ€ô‘…Ñ”¹Ñ½‘…ä ¤€¬Ñ¥µ•‘•±Ñ„¡‘…åÌôÄ¤(€€€‰±½­Ì€ômt(€€€½¹•ÁÑÌ€ôl‰	•É¹½Õ±±¤•ÅÕ…Ñ¥½¹Ìˆ°€‰á…Ð•ÅÕ…Ñ¥½¹Ìˆ°€‰5¥á••á…´ÁÉ…Ñ¥”‰t(€€€™½È¥¹‘•à°½¹•ÁÐ¥¸•¹Õµ•É…Ñ”¡½¹•ÁÑÌ¤è(€€€€€€€‰±½­Ì¹…ÁÁ•¹¡ì‰‘…Ñ”ˆè€¡ÍÑ…ÉÐ€¬Ñ¥µ•‘•±Ñ„¡‘…åÌõ¥¹‘•à¤¤¹¥Í½™½Éµ…Ð ¤°€‰µ¥¹ÕÑ•ÌˆèÁ…å±½…¹µ¥¹ÕÑ•Í}Á•É}‘…ä°€‰½¹•ÁÐˆè½¹•ÁÑô¤(€€€É•ÑÕÉ¸ì‰‰±½­Ìˆè‰±½­Ì°€‰…±•¹‘…É}ÍÑÕˆˆèQÉÕ•ô(()…ÁÀ¹•Ð ˆ½…Á¤½ÍÕ‰©•ÑÌ½íÍÕ‰©•Ñ}¥‘ô½É•Á½ÉÐˆ¤)‘•˜É•Á½ÉÐ¡ÍÕ‰©•Ñ}¥èÍÑÈ°ÕÍ•Èè‘¥Ð€ô•Á•¹‘Ì¡É•ÅÕ¥É•}ÕÍ•È¤¤€´ø‘¥Ðè(€€€•Ñ}ÍÕ‰©•Ñ}½É|ÐÀÐ¡ÍÕ‰©•Ñ}¥°ÕÍ•Él‰¥‰t¤(€€€Ý¥Ñ ½¹¹•Ð ¤…Ì‘ˆè(€€€€€€€…ÑÑ•µÁÑÌ€ômÉ½Ý}‘¥Ð¡É½Ü¤™½ÈÉ½Ü¥¸‘ˆ¹•á•ÕÑ” ‰M1P€¨I=4…ÑÑ•µÁÑÌ]!IÍÕ‰©•Ñ}¥€ô€üˆ°€¡ÍÕ‰©•Ñ}¥°¤¥t(€€€Ñ½Ñ…°€ô±•¸¡…ÑÑ•µÁÑÌ¤(€€€½ÉÉ•Ð€ôÍÕ´¡¥Ñ•µl‰½ÉÉ•Ð‰t™½È¥Ñ•´¥¸…ÑÑ•µÁÑÌ¤(€€€•ÉÑ…¥¸€ôm¥Ñ•´™½È¥Ñ•´¥¸…ÑÑ•µÁÑÌ¥˜¥Ñ•µl‰½¹™¥‘•¹”‰t€ôô€‰•ÉÑ…¥¸‰t(€€€…±¥‰É…Ñ•€ôÍÕ´¡¥Ñ•µl‰½ÉÉ•Ð‰t™½È¥Ñ•´¥¸•ÉÑ…¥¸¤(€€€É•ÑÕÉ¸ì(€€€€€€€€‰Ñ¥µ•}µ¥¹ÕÑ•Ìˆè€ÔÐ€¬Ñ½Ñ…°€¨€È°(€€€€€€€€‰…ÕÉ…äˆèÉ½Õ¹¡½ÉÉ•Ð€¼Ñ½Ñ…°€¨€ÄÀÀ¤¥˜Ñ½Ñ…°•±Í”€ÜÔ°(€€€€€€€€‰…ÑÑ•µÁÑ•ˆè€ÄÈ€¬Ñ½Ñ…°°(€€€€€€€€‰Íå±±…‰ÕÍ}½Ù•É…”ˆè€Øà°(€€€€€€€€‰¡¥¹Ñ}ÑÉ•¹ˆèlÌ¸Ä°€È¸à°€È¸Ð°€Ä¸ä°€Ä¸Ñt°(€€€€€€€€‰½¹™¥‘•¹•}Í½É”ˆèÉ½Õ¹¡…±¥‰É…Ñ•€¼±•¸¡•ÉÑ…¥¸¤€¨€ÄÀÀ¤¥˜•ÉÑ…¥¸•±Í”€Üà°(€€€€€€€€‰•ÉÉ½ÉÌˆèl(€€€€€€€€€€€ì‰ÑåÁ”ˆè€‰M¥¸•ÉÉ½Èˆ°€‰½Õ¹Ðˆèµ…à Ä°ÍÕ´¡¥Ñ•µl‰•ÉÉ½É}ÑåÁ”‰t€ôô€‰Í¥¸•ÉÉ½Èˆ™½È¥Ñ•´¥¸…ÑÑ•µÁÑÌ¤¤°€‰½±½Èˆè€ˆàÜäÑ‰ô°(€€€€€€€€€€€ì‰ÑåÁ”ˆè€‰½¹•ÁÐ…Àˆ°€‰½Õ¹Ðˆèµ…à È°ÍÕ´¡¥Ñ•µl‰•ÉÉ½É}ÑåÁ”‰t€ôô€‰½¹•ÁÑÕ…°…Àˆ™½È¥Ñ•´¥¸…ÑÑ•µÁÑÌ¤¤°€‰½±½Èˆè€ˆŒÌÜÔÕÔ‰ô°(€€€€€€€€€€€ì‰ÑåÁ”ˆè€‰É¥Ñ¡µ•Ñ¥Œˆ°€‰½Õ¹Ðˆè€Ä°€‰½±½Èˆè€ˆÁÌÑ‰ô°(€€€€€€€t°(€€€€€€€€‰Ñ½µ½ÉÉ½Üˆèl‰	•É¹½Õ±±¤É•½¹¥Ñ¥½¸ƒ
Ü€ÈÀµ¥¸ˆ°€‰á…Ð•ÅÕ…Ñ¥½¹Ìƒ
Ü€ÈÔµ¥¸ˆ°€‰½ÉµÕ±„É•…±°ƒ
Ü€Ôµ¥¸‰t°(€€€ô(((ŒQ¡”ÁÉ½‘ÕÑ¥½¸™É½¹Ñ•¹¥ÌÍ•ÉÙ•‰ä…ÍÑA$Í¼Ñ¡”‘•µ¼¹••‘Ì½¹”ÁÉ½•ÍÌ¸)I=9Q9}%MP€ôI==P¹Á…É•¹Ð€¼€‰™É½¹Ñ•¹ˆ€¼€‰‘¥ÍÐˆ)¥˜I=9Q9}%MP¹•á¥ÍÑÌ ¤è(€€€…ÁÀ¹µ½Õ¹Ð ˆ¼ˆ°MÑ…Ñ¥¥±•Ì¡‘¥É•Ñ½ÉäõI=9Q9}%MP°¡Ñµ°õQÉÕ”¤°¹…µ”ô‰™É½¹Ñ•¹ˆ¤