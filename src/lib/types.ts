// Core domain types for Prism — the AI study companion.

export type ResourceKind =
  | "notes"
  | "textbook"
  | "question-bank"
  | "past-paper"
  | "syllabus"
  | "photo";

export type ResourceStatus =
  | "parsing"
  | "parsed"
  | "ocr-low"
  | "gap";

export interface Resource {
  id: string;
  name: string;
  kind: ResourceKind;
  status: ResourceStatus;
  pages?: number;
  note?: string; // human-facing status detail, e.g. "OCR confidence low past page 12"
  uploadedAt: number;
  sizeKb?: number;
}

export type ConceptStatus =
  | "locked"
  | "available"
  | "in-progress"
  | "mastered";

export interface Concept {
  id: string;
  title: string;
  description: string;
  unit: string;
  examWeight: number; // 0..1, derived from past-paper frequency
  mastery: number; // 0..1
  status: ConceptStatus;
  dependencies: string[]; // concept ids that must be mastered first
  hintsUsed: number; // total hints requested across attempts on this concept
  fullReveals: number; // total full-solution reveals
  attempts: number;
  x?: number; // layout hint for graph
  y?: number;
}

export type Confidence = "guessed" | "fairly-sure" | "certain";

export type ErrorType =
  | "sign-error"
  | "wrong-formula"
  | "conceptual-gap"
  | "arithmetic-slip"
  | "none";

export interface AttemptStep {
  id: string;
  latex: string;
  text: string;
  confidence: Confidence;
  correct: boolean;
  feedback?: string;
  errorType?: ErrorType;
  hintLevel?: 0 | 1 | 2 | 3; // 0 = none, 3 = full reveal
  checkedAt?: number;
}

export interface PracticeAttempt {
  id: string;
  problemId: string;
  conceptId: string;
  steps: AttemptStep[];
  startedAt: number;
  completedAt?: number;
  betterMethod?: string;
  solved: boolean;
}

export interface PracticeProblem {
  id: string;
  conceptId: string;
  prompt: string;
  latex?: string; // optional rendered math in the prompt
  difficulty: 1 | 2 | 3 | 4 | 5;
  source: "bank" | "ai" | "past-paper";
  solutionPaths?: string[][]; // multiple valid step sequences (text), for better-method comparison
  topic?: string;
}

export interface TheoryQAPair {
  id: string;
  conceptId?: string;
  question: string;
  studentAnswer?: string;
  generatedAnswer?: string;
  rubric: {
    definition: boolean;
    diagram: boolean;
    derivation: boolean;
    example: boolean;
  };
  score?: number; // 0..100
  feedback?: string;
  createdAt: number;
}

export interface DiagnosticQuestion {
  id: string;
  conceptId: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface DiagnosticResult {
  completedAt: number;
  total: number;
  correct: number;
  perConcept: { conceptId: string; correct: boolean }[];
}

export interface Workspace {
  id: string;
  name: string;
  examDate?: string | null;
  color: string; // accent token
  createdAt: number;
  resources: Resource[];
  concepts: Concept[];
  problems: PracticeProblem[];
  attempts: PracticeAttempt[];
  theory: TheoryQAPair[];
  diagnostic?: DiagnosticResult;
  report?: DailyReport;
  syllabusProgress: number; // 0..1
}

export interface DailyReport {
  date: string; // ISO date
  conceptsCovered: string[]; // concept ids
  timeSpentMin: number;
  accuracy: number; // 0..1
  errorTypes: Record<ErrorType, number>;
  betterMethodsLearned: string[];
  remainingPct: number; // 0..100
  hintTrend: { conceptId: string; fullReveals: number; hints: number }[];
  calibrationScore?: number; // 0..100, how well confidence matched correctness
  tomorrowQueue: { conceptId: string; reason: string }[];
  narrative?: string;
}

export interface User {
  name: string;
  course: string;
  semester: string;
  examDate?: string | null;
  onboarded: boolean;
  avatarSeed: string;
}

export type View =
  | "onboarding"
  | "dashboard"
  | "workspace"
  | "diagnostic"
  | "profile"
  | "settings";

export type WorkspaceTab =
  | "practice"
  | "curriculum"
  | "resources"
  | "theory"
  | "report";
