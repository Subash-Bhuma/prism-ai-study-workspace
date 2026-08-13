import type {
  Concept,
  PracticeProblem,
  DiagnosticQuestion,
  ErrorType,
} from "./types";

// The model driving every AI feature in Prism: step-checking, hint ladder,
// curriculum mapping, practice/theory generation, diagnostics, daily reports.
export const AI_MODEL = process.env.AI_MODEL || "glm-4.7-flash";
export const AI_CONFIGURED = Boolean(process.env.ZAI_API_KEY);

/** Strip code fences and parse JSON from an LLM response. */
function parseJSON<T>(raw: string): T {
  let s = raw.trim();
  // remove ```json ... ``` fences
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  // find first { or [
  const first = s.search(/[\[{]/);
  if (first > 0) s = s.slice(first);
  const last = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
  if (last > -1) s = s.slice(0, last + 1);
  return JSON.parse(s) as T;
}

async function complete(system: string, user: string): Promise<string> {
  const apiKey = process.env.ZAI_API_KEY;
  if (!apiKey) throw new Error("GLM is not configured");
  const baseUrl = (process.env.ZAI_BASE_URL || "https://open.bigmodel.cn/api/paas/v4").replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      thinking: { type: "disabled" },
      temperature: 0.2,
      max_tokens: 4096,
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`GLM request failed (${response.status}): ${detail.slice(0, 180)}`);
  }
  const payload = await response.json() as {
    choices?: { message?: { content?: string } }[];
  };
  return payload.choices?.[0]?.message?.content ?? "";
}

function fallbackCurriculum(subject: string): Concept[] {
  const templates = [
    ["Foundations", `Core definitions and notation for ${subject}.`, "Unit 1", 0.14, []],
    ["First principles", "Standard forms, assumptions, and basic techniques.", "Unit 1", 0.16, ["Foundations"]],
    ["Core methods", "The main procedures used to solve exam problems.", "Unit 2", 0.2, ["First principles"]],
    ["Worked applications", "Applying the core methods to representative problems.", "Unit 3", 0.18, ["Core methods"]],
    ["Advanced cases", "Exceptions, edge cases, and multi-step applications.", "Unit 4", 0.15, ["Core methods"]],
    ["Exam synthesis", "Mixed problems that combine concepts across units.", "Unit 5", 0.17, ["Worked applications", "Advanced cases"]],
  ] as const;
  const ids = new Map(templates.map((item, index) => [item[0], `local-${index + 1}`]));
  return templates.map(([title, description, unit, examWeight, dependencies], index) => ({
    id: `local-${index + 1}`,
    title,
    description,
    unit,
    examWeight,
    mastery: 0,
    status: index < 2 ? "available" : "locked",
    dependencies: dependencies.map((dependency) => ids.get(dependency)!).filter(Boolean),
    hintsUsed: 0,
    fullReveals: 0,
    attempts: 0,
  }));
}

// ────────────────────────────────────────────────────────────────────────────
// 1. Curriculum mapping — build a dependency graph from the REAL extracted text
//    of uploaded resources. The AI actually reads the material.
// ────────────────────────────────────────────────────────────────────────────
export interface IngestedFile {
  name: string;
  kind: string;
  note?: string;
  text: string; // the real extracted text — this is what the AI reads
}

// Cap each file's contribution so a giant textbook doesn't blow the context.
function truncate(text: string, max = 4000): string {
  if (text.length <= max) return text;
  // keep head + tail so chapter lists AND conclusions survive
  const head = text.slice(0, max * 0.6);
  const tail = text.slice(text.length - max * 0.4);
  return `${head}\n…[truncated]…\n${tail}`;
}

export async function mapCurriculum(opts: {
  subject: string;
  files: IngestedFile[];
}): Promise<Concept[]> {
  if (!AI_CONFIGURED) return fallbackCurriculum(opts.subject);
  const system =
    "You are an expert academic curriculum designer for Indian engineering exams. " +
    "You are given the ACTUAL EXTRACTED TEXT of a student's uploaded study material (notes, textbook chapters, question banks, past papers, syllabus). " +
    "Read it carefully and produce a dependency graph of concepts DRAWN FROM THIS MATERIAL. " +
    "Weight exam importance by how frequently each concept appears in the past-paper / question-bank portions of the material — not by guesswork. " +
    "If the material has a visible gap (a unit with no coverage), still include that concept but mark its status \"locked\". " +
    "Always respond with valid JSON only — no prose, no code fences.";

  const materialBlock = opts.files
    .map(
      (f, i) =>
        `### FILE ${i + 1}: ${f.name}  [${f.kind}]${f.note ? `\n(status: ${f.note})` : ""}\n${truncate(f.text)}`
    )
    .join("\n\n---\n\n");

  const user = `Subject: ${opts.subject}

Below is the EXTRACTED TEXT of everything the student uploaded. Build the curriculum from THIS content.

${materialBlock || "(no extractable text was found in any file)"}

Based on the material above, build a curriculum of 6-10 concepts. Return a JSON array. Each item:
{
  "title": string (short),
  "description": string (1 sentence, grounded in the material),
  "unit": string (e.g. "Unit 1"),
  "examWeight": number (0..1, sum ≈ 1.0, derived from frequency in past-paper/question-bank portions),
  "mastery": 0,
  "status": "available" | "locked" (locked if the material doesn't cover it yet),
  "dependencies": string[] (titles of concepts that must come first; empty for roots),
  "hintsUsed": 0,
  "fullReveals": 0,
  "attempts": 0
}
Order by unit then dependency. Only output the JSON array.`;

  const raw = await complete(system, user);
  try {
    const concepts = parseJSON<Concept[]>(raw);
    const titleToId = new Map<string, string>();
    concepts.forEach((c, i) =>
      titleToId.set(c.title, `c-${i}-${Date.now().toString(36)}`)
    );
    return concepts.map((c) => ({
      ...c,
      id: titleToId.get(c.title)!,
      dependencies: c.dependencies
        .map((d) => titleToId.get(d))
        .filter(Boolean) as string[],
    }));
  } catch {
    return [];
  }
}

/**
 * Build a compact RAG context string from ingested files — used to ground
 * practice generation and theory answers in the student's OWN material
 * (matching their professor's phrasing and emphasis).
 */
export function buildMaterialContext(files: IngestedFile[], maxTotal = 6000): string {
  let budget = maxTotal;
  const parts: string[] = [];
  for (const f of files) {
    if (budget <= 0) break;
    if (!f.text.trim()) continue;
    const chunk = truncate(f.text, Math.min(2000, budget));
    parts.push(`[${f.kind}] ${f.name}:\n${chunk}`);
    budget -= chunk.length;
  }
  return parts.join("\n\n");
}

// ────────────────────────────────────────────────────────────────────────────
// 2. Step checking — the core mechanic. Silent when correct, specific when wrong.
// ────────────────────────────────────────────────────────────────────────────
export interface StepCheck {
  correct: boolean;
  errorType: ErrorType;
  feedback: string; // empty string when correct (AI stays silent)
  nudgesToward?: string; // a micro-hint, only when wrong
  looksComplete?: boolean; // whether the step looks like the final answer
}

export async function checkStep(opts: {
  problem: { prompt: string; latex?: string; solutionPaths?: string[][] };
  priorSteps: { text: string }[];
  currentStep: { text: string; latex?: string };
}): Promise<StepCheck> {
  if (!AI_CONFIGURED) {
    const text = opts.currentStep.text.trim();
    const normalized = text.toLowerCase();
    const expected = opts.problem.solutionPaths?.flat() ?? [];
    const expectedWords = new Set(
      expected.join(" ").toLowerCase().match(/[a-z]{3,}|\d+/g) ?? []
    );
    const words = normalized.match(/[a-z]{3,}|\d+/g) ?? [];
    const overlap = words.filter((word) => expectedWords.has(word)).length;
    const obviousError = /\b(undefined|impossible|cannot solve|random)\b/.test(normalized);
    const correct = !obviousError && text.length >= 4 && (overlap > 0 || /[=+\-*/^]|therefore|hence|substitut|integrat|differentiat/i.test(text));
    return {
      correct,
      errorType: correct ? "none" : "conceptual-gap",
      feedback: correct ? "" : "Connect this step to the equation or name the rule you used.",
      looksComplete: correct && /\b(final|answer|solution|therefore|hence)\b|=\s*c\b/i.test(text),
    };
  }
  const system =
    "You are a meticulous mathematics examiner checking ONE step of a student's working. " +
    "A step is CORRECT if it is a valid, non-redundant move toward solving the problem using ANY standard method — " +
    "students may take a different-but-valid route; do not flag method choice as wrong. " +
    "When the step is correct, return empty feedback (stay silent). " +
    "When wrong, classify the error precisely and give a SHORT, pointed correction. " +
    "Always respond with valid JSON only.";

  const user = `Problem: ${opts.problem.prompt}
${opts.problem.latex ? "Given equation: $" + opts.problem.latex + "$" : ""}

Prior steps the student has written:
${opts.priorSteps.length ? opts.priorSteps.map((s, i) => `  ${i + 1}. ${s.text}`).join("\n") : "  (none — this is the first step)"}

Current step to check:
  "${opts.currentStep.text}"${opts.currentStep.latex ? "  ($" + opts.currentStep.latex + "$)" : ""}

Return JSON exactly:
{
  "correct": boolean,
  "errorType": "none" | "sign-error" | "wrong-formula" | "conceptual-gap" | "arithmetic-slip",
  "feedback": string (empty when correct; <= 18 words when wrong, name the specific slip),
  "looksComplete": boolean (true if this step states the final answer)
}`;

  const raw = await complete(system, user);
  try {
    const parsed = parseJSON<StepCheck>(raw);
    if (parsed.correct) parsed.feedback = "";
    return parsed;
  } catch {
    return {
      correct: false,
      errorType: "conceptual-gap",
      feedback: "I couldn't verify that step — try restating it.",
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 3. Hint ladder — pointed question → named concept → partial step → full reveal.
// ────────────────────────────────────────────────────────────────────────────
export async function getHint(opts: {
  problem: { prompt: string; latex?: string; solutionPaths?: string[][] };
  priorSteps: { text: string }[];
  level: 1 | 2 | 3; // 1=question, 2=named concept, 3=partial worked step
}): Promise<string> {
  if (!AI_CONFIGURED) {
    const next = opts.problem.solutionPaths?.[0]?.[opts.priorSteps.length] ??
      opts.problem.solutionPaths?.[0]?.[0];
    if (opts.level === 1) return "Which definition or standard form makes the next move valid?";
    if (opts.level === 2) return next ? `Use the method behind: ${next}` : "Rewrite the problem in its standard form first.";
    return next ? `Try this next step: ${next}` : "State the known quantities, then isolate the term you need.";
  }
  const levelDesc = {
    1: "a pointed QUESTION that nudges the student to think, without giving anything away. One sentence, ends with '?'.",
    2: "name the SPECIFIC CONCEPT or technique they should use next, with one phrase of why. No worked math.",
    3: "show ONE partial worked step that gets them moving. Keep it to 2-3 lines of math plus a line of explanation.",
  }[opts.level];

  const system =
    "You are a patient tutor who gives hints on a strict ladder. " +
    "Never jump levels. Never give the full solution unless explicitly asked for level 4. " +
    "Respond with plain text, no JSON.";

  const user = `Problem: ${opts.problem.prompt}
${opts.problem.latex ? "Given: $" + opts.problem.latex + "$" : ""}

Student's working so far:
${opts.priorSteps.length ? opts.priorSteps.map((s, i) => `  ${i + 1}. ${s.text}`).join("\n") : "  (none yet)"}

Give hint level ${opts.level}: ${levelDesc}`;

  return (await complete(system, user)).trim();
}

export async function getFullSolution(opts: {
  problem: { prompt: string; latex?: string; solutionPaths?: string[][] };
}): Promise<string> {
  if (!AI_CONFIGURED) {
    const path = opts.problem.solutionPaths?.[0];
    if (path?.length) return path.map((step, index) => `${index + 1}. ${step}`).join("\n");
    return "1. Rewrite the given expression in standard form.\n2. Apply the relevant definition or method.\n3. Simplify carefully and verify the result in the original problem.";
  }
  const system =
    "You are a clear mathematics instructor. Show a complete worked solution in concise steps. Plain text, use $...$ for inline math and $$...$$ for display math. No preamble.";
  const user = `Solve fully: ${opts.problem.prompt}${opts.problem.latex ? "\nGiven: $" + opts.problem.latex + "$" : ""}`;
  return (await complete(system, user)).trim();
}

// ────────────────────────────────────────────────────────────────────────────
// 4. Better-method feedback — compare student path against alternatives.
// ────────────────────────────────────────────────────────────────────────────
export async function getBetterMethod(opts: {
  problem: { prompt: string; latex?: string };
  studentSteps: { text: string }[];
  solutionPaths?: string[][];
}): Promise<string> {
  if (!AI_CONFIGURED) {
    const shortest = [...(opts.solutionPaths ?? [])].sort((a, b) => a.length - b.length)[0];
    return shortest?.length
      ? `Your route works. The reference path reaches the result in ${shortest.length} clear steps; naming the method before the algebra would make it easier for an examiner to follow.`
      : "Your method is valid. Keep the setup explicit and finish with a quick substitution check.";
  }
  const system =
    "You are an examiner comparing a student's correct solution against known alternative methods. " +
    "If a shorter or more examiner-expected method exists, point it out warmly and concretely. " +
    "If the student's method is already the expected one, say so briefly. " +
    "Plain text, 2-4 sentences. No JSON.";

  const altPaths = opts.solutionPaths?.length
    ? `\nKnown alternative solution paths:\n${opts.solutionPaths
        .map((p, i) => `  Path ${i + 1}: ${p.join(" → ")}`)
        .join("\n")}`
    : "";

  const user = `Problem: ${opts.problem.prompt}
${opts.problem.latex ? "Given: $" + opts.problem.latex + "$" : ""}

Student's solution (correct, but maybe not the shortest):
${opts.studentSteps.map((s, i) => `  ${i + 1}. ${s.text}`).join("\n")}
${altPaths}

Was there a shorter or more examiner-expected method? Name it and say why it's better. If theirs was already ideal, say so.`;

  return (await complete(system, user)).trim();
}

// ────────────────────────────────────────────────────────────────────────────
// 5. Theory answers — generated from uploaded material, graded by rubric.
// ────────────────────────────────────────────────────────────────────────────
export interface TheoryGenerated {
  answer: string;
  rubric: { definition: boolean; diagram: boolean; derivation: boolean; example: boolean };
}

export async function generateTheory(opts: {
  question: string;
  context?: string;
}): Promise<TheoryGenerated> {
  if (!AI_CONFIGURED) {
    const context = opts.context?.trim() || "the uploaded course material";
    return {
      answer: `## Definition\n${opts.question} is answered by first stating the governing definition from ${context.slice(0, 220)}.\n\n## Diagram\nDraw and label the quantities, direction, and boundary conditions used in the definition.\n\n## Derivation\nStart from the definition, substitute the known conditions, and simplify one justified step at a time.\n\n## Example\nApply the result to a simple representative case, then state what the result means.`,
      rubric: { definition: true, diagram: true, derivation: true, example: true },
    };
  }
  const system =
    "You are a university professor writing model theory answers from the student's OWN uploaded material, " +
    "matching their professor's phrasing and emphasis. " +
    "Write in markdown with four sections, each a ## heading in this order: Definition, Diagram, Derivation, Example. " +
    "Use $...$ for inline math and $$...$$ for display math. For the diagram, use an ASCII/text sketch or describe it. " +
    "Respond with ONLY the markdown answer — no JSON, no code fences, no preamble.";

  const user = `Question: ${opts.question}
${opts.context ? "Material context: " + opts.context : ""}

Write the model answer now.`;

  const raw = await complete(system, user);
  return {
    answer: raw.trim(),
    rubric: { definition: true, diagram: true, derivation: true, example: true },
  };
}

export interface TheoryGraded {
  rubric: { definition: boolean; diagram: boolean; derivation: boolean; example: boolean };
  score: number;
  feedback: string;
}

export async function gradeTheory(opts: {
  question: string;
  studentAnswer: string;
}): Promise<TheoryGraded> {
  if (!AI_CONFIGURED) {
    const answer = opts.studentAnswer.toLowerCase();
    const rubric = {
      definition: /\b(is defined|definition|means|refers to)\b/.test(answer),
      diagram: /\b(diagram|figure|graph|sketch|axis|label)\b/.test(answer),
      derivation: /[=⇒]|\b(derive|therefore|hence|substitut|step)\b/.test(answer),
      example: /\b(example|for instance|consider|e\.g\.)\b/.test(answer),
    };
    const score = Object.values(rubric).filter(Boolean).length * 25;
    const missing = Object.entries(rubric).filter(([, present]) => !present).map(([key]) => key);
    return {
      rubric,
      score,
      feedback: missing.length ? `Add a clear ${missing.join(", ")} section to recover the missing marks.` : "Complete structure: every rubric element is visible to the examiner.",
    };
  }
  const system =
    "You are a strict but fair examiner grading a theory answer against a structural rubric: " +
    "definition stated, diagram included, derivation steps present, example given. " +
    "Theory answers lose marks on structure and completeness, not step-correctness. " +
    "Respond with JSON only.";

  const user = `Question: ${opts.question}
Student's answer:
"""
${opts.studentAnswer}
"""

Return JSON:
{
  "rubric": { "definition": bool, "diagram": bool, "derivation": bool, "example": bool },
  "score": number (0-100),
  "feedback": string (<= 40 words, name which piece cost marks and why)
}`;

  const raw = await complete(system, user);
  try {
    return parseJSON<TheoryGraded>(raw);
  } catch {
    return {
      rubric: { definition: true, diagram: false, derivation: true, example: false },
      score: 60,
      feedback: "Couldn't fully parse — partial credit given. Add a diagram and an example.",
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 6. Adaptive practice generation — pull from banks first, AI variations to fill.
// ────────────────────────────────────────────────────────────────────────────
export async function generatePractice(opts: {
  concept: { title: string; description: string };
  difficulty: 1 | 2 | 3 | 4 | 5;
  context?: string;
}): Promise<PracticeProblem> {
  if (!AI_CONFIGURED) {
    return {
      id: `p-local-${Date.now().toString(36)}`,
      conceptId: "",
      prompt: `Using ${opts.concept.title}, solve a representative exam problem and justify each transformation.`,
      difficulty: opts.difficulty,
      source: "ai",
      solutionPaths: [[
        `State the definition or standard form for ${opts.concept.title}.`,
        "Identify the known values and the required result.",
        "Substitute and simplify one valid step at a time.",
        "State the final answer and verify it against the original conditions.",
      ]],
      topic: opts.concept.title,
    };
  }
  const system =
    "You generate exam-style practice problems calibrated to a concept and difficulty. " +
    "Problems must be self-contained and solvable in 4-8 steps. " +
    "Respond with JSON only.";

  const diffLabel = ["", "warm-up", "standard", "exam-level", "hard exam", "challenge"][opts.difficulty];
  const user = `Concept: ${opts.concept.title} — ${opts.concept.description}
Difficulty: ${opts.difficulty}/5 (${diffLabel})
${opts.context ? "Material context: " + opts.context : ""}

Return JSON:
{
  "prompt": string (the problem statement, plain text),
  "latex": string (optional, the key equation in LaTeX without $...$),
  "solutionPaths": string[][] (2 different valid solution paths, each an array of step descriptions)
}`;

  const raw = await complete(system, user);
  try {
    const parsed = parseJSON<{ prompt: string; latex?: string; solutionPaths: string[][] }>(raw);
    return {
      id: `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      conceptId: "",
      prompt: parsed.prompt,
      latex: parsed.latex,
      difficulty: opts.difficulty,
      source: "ai",
      solutionPaths: parsed.solutionPaths,
      topic: opts.concept.title,
    };
  } catch {
    return {
      id: `p-${Date.now().toString(36)}`,
      conceptId: "",
      prompt: opts.concept.description,
      difficulty: opts.difficulty,
      source: "ai",
      solutionPaths: [],
      topic: opts.concept.title,
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 7. Diagnostic placement — 10-15 adaptive MCQs spanning the syllabus.
// ────────────────────────────────────────────────────────────────────────────
export async function generateDiagnostic(opts: {
  subject: string;
  concepts: { title: string; description: string }[];
}): Promise<DiagnosticQuestion[]> {
  if (!AI_CONFIGURED) {
    const concepts = opts.concepts.length ? opts.concepts : [{ title: opts.subject, description: "Core course knowledge" }];
    return Array.from({ length: 8 }, (_, index) => {
      const concept = concepts[index % concepts.length];
      return {
        id: `dq-local-${index + 1}`,
        conceptId: concept.title,
        prompt: `Which statement best captures the role of ${concept.title}?`,
        options: [
          concept.description,
          "It is unrelated to the course syllabus.",
          "It is used only after the final answer is known.",
          "It removes the need to justify intermediate steps.",
        ],
        correctIndex: 0,
        explanation: concept.description,
      };
    });
  }
  const system =
    "You build a short diagnostic placement test (8 MCQs) spanning a syllabus, " +
    "sampling the most important concepts, easy to medium difficulty. " +
    "Respond with JSON only — a flat array. Be concise.";

  const user = `Subject: ${opts.subject}
Concepts to sample:
${opts.concepts.map((c, i) => `  ${i + 1}. ${c.title}: ${c.description}`).join("\n")}

Return a JSON array of 8 items, each:
{
  "conceptId": string (use the concept title as id here),
  "prompt": string (concise),
  "options": string[4],
  "correctIndex": number (0-3),
  "explanation": string (1 short sentence)
}`;

  const raw = await complete(system, user);
  try {
    return parseJSON<DiagnosticQuestion[]>(raw);
  } catch {
    return [];
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 8. Daily report — aggregate the data you already have into a narrative.
// ────────────────────────────────────────────────────────────────────────────
export interface ReportInput {
  subject: string;
  conceptsCovered: { title: string; mastery: number }[];
  timeSpentMin: number;
  accuracy: number;
  errorTypes: Record<ErrorType, number>;
  betterMethodsLearned: string[];
  remainingPct: number;
  hintTrend: { title: string; fullReveals: number; hints: number }[];
  calibrationScore?: number;
  tomorrowQueue: { title: string; reason: string }[];
}

export interface ReportOutput {
  narrative: string;
  tomorrowQueue: { title: string; reason: string }[];
}

export async function generateReportNarrative(input: ReportInput): Promise<ReportOutput> {
  if (!AI_CONFIGURED) {
    const accuracy = Math.round(input.accuracy * 100);
    const calibration = input.calibrationScore == null ? "not measured yet" : `${input.calibrationScore}/100`;
    const hintSignal = input.hintTrend.reduce((sum, item) => sum + item.fullReveals, 0);
    return {
      narrative: `You worked for ${input.timeSpentMin} minutes with ${accuracy}% step accuracy. Confidence calibration is ${calibration}. The strongest retention signal today is the hint pattern: ${hintSignal} full solution reveal${hintSignal === 1 ? "" : "s"}. Fewer full reveals on the next pass will matter more than a flat accuracy score. Tomorrow, start with the weakest high-weight concept, solve one problem without opening the full solution, then revisit any repeated error type.`,
      tomorrowQueue: input.tomorrowQueue,
    };
  }
  const system =
    "You are a study coach writing an honest, specific daily report for a student. " +
    "Celebrate the signal that matters (fewer full reveals = sticking), call out calibration honestly, " +
    "and propose tomorrow's queue from weak + high-weight concepts. " +
    "Plain text narrative, 90-140 words. No JSON for the narrative.";

  const user = `Subject: ${input.subject}
Today's data:
- Concepts covered: ${input.conceptsCovered.map((c) => `${c.title} (${Math.round(c.mastery * 100)}%)`).join(", ") || "none"}
- Time spent: ${input.timeSpentMin} min
- Accuracy: ${Math.round(input.accuracy * 100)}%
- Error breakdown: ${Object.entries(input.errorTypes).filter(([, v]) => v > 0).map(([k, v]) => `${k}×${v}`).join(", ") || "none"}
- Better methods learned: ${input.betterMethodsLearned.length || 0}
- Syllabus remaining: ${input.remainingPct}%
- Hint trend (full reveals vs partial hints per concept): ${input.hintTrend.map((h) => `${h.title}: ${h.fullReveals} full / ${h.hints} hints`).join(", ") || "none"}
- Confidence calibration: ${input.calibrationScore != null ? input.calibrationScore + "/100" : "not measured"}

Write the narrative. Be specific and human — no bullet lists in the narrative. Mention the hint trend as the real "is it sticking" signal. End with one line on what to do tomorrow.

Then on a NEW line, output a JSON array for tomorrow's queue (override the suggested one if your judgment differs):
[{"title": "...", "reason": "..."}]`;

  const raw = await complete(system, user);
  // split narrative from trailing JSON array
  const arrMatch = raw.match(/\[\s*\{[\s\S]*\}\s*\]/);
  const narrative = (arrMatch ? raw.slice(0, arrMatch.index) : raw).trim();
  let tomorrowQueue = input.tomorrowQueue;
  if (arrMatch) {
    try {
      tomorrowQueue = JSON.parse(arrMatch[0]);
    } catch {
      /* keep fallback */
    }
  }
  return { narrative, tomorrowQueue };
}
