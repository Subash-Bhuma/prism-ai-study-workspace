import type {
  Workspace,
  Concept,
  PracticeProblem,
  Resource,
  User,
} from "./types";

export const DEMO_USER: User = {
  name: "Aarav Mehta",
  course: "B.Tech — Engineering Mathematics",
  semester: "Semester 4",
  examDate: null,
  onboarded: false,
  avatarSeed: "aarav",
};

const rid = (s: string) => `r-${s}`;
const cid = (s: string) => `c-${s}`;
const pid = (s: string) => `p-${s}`;

const demoResources: Resource[] = [
  {
    id: rid("tb"),
    name: "Advanced Engineering Mathematics — Erwin Kreyszig (Ch. 1-4)",
    kind: "textbook",
    status: "parsed",
    pages: 412,
    note: "Parsed cleanly. 4 chapters indexed.",
    uploadedAt: Date.now() - 1000 * 60 * 60 * 26,
    sizeKb: 18420,
  },
  {
    id: rid("notes"),
    name: "Prof. Sharma — Differential Equations (handwritten scans)",
    kind: "photo",
    status: "ocr-low",
    pages: 38,
    note: "OCR confidence low past page 12 (smudged ink). Re-upload or proceed anyway.",
    uploadedAt: Date.now() - 1000 * 60 * 60 * 25,
    sizeKb: 9820,
  },
  {
    id: rid("qb"),
    name: "Question Bank — MA8353 (2020-2024)",
    kind: "question-bank",
    status: "parsed",
    pages: 96,
    note: "216 problems indexed, 84 tagged to past papers.",
    uploadedAt: Date.now() - 1000 * 60 * 60 * 24,
    sizeKb: 4210,
  },
  {
    id: rid("pp"),
    name: "Past Papers — Nov 2023, May 2023, Nov 2022",
    kind: "past-paper",
    status: "parsed",
    pages: 18,
    note: "Frequency analysis complete. Exam weighting derived from these.",
    uploadedAt: Date.now() - 1000 * 60 * 60 * 23,
    sizeKb: 2110,
  },
  {
    id: rid("gap"),
    name: "Syllabus — MA8353 (regulation 2017)",
    kind: "syllabus",
    status: "gap",
    note: "Looks like a gap between Unit 3 (Laplace) and Unit 5 (Vector) — no material uploaded for Unit 4 (Z-transforms).",
    uploadedAt: Date.now() - 1000 * 60 * 60 * 22,
    sizeKb: 320,
  },
];

// A dependency graph of concepts. examWeight derived from past-paper frequency.
const demoConcepts: Concept[] = [
  {
    id: cid("ode"),
    title: "First-Order ODEs",
    description:
      "Separable, linear, exact equations; integrating factors; Bernoulli & homogeneous forms.",
    unit: "Unit 1",
    examWeight: 0.22,
    mastery: 0.62,
    status: "in-progress",
    dependencies: [],
    hintsUsed: 4,
    fullReveals: 1,
    attempts: 9,
  },
  {
    id: cid("linear"),
    title: "Linear First-Order ODEs",
    description: "Standard form, integrating factor method, modelling applications.",
    unit: "Unit 1",
    examWeight: 0.1,
    mastery: 0.7,
    status: "in-progress",
    dependencies: [cid("ode")],
    hintsUsed: 2,
    fullReveals: 0,
    attempts: 5,
  },
  {
    id: cid("bern"),
    title: "Bernoulli Equations",
    description:
      "Reduction to linear form via substitution v = y^{1-n}. A common exam shortcut.",
    unit: "Unit 1",
    examWeight: 0.08,
    mastery: 0.3,
    status: "available",
    dependencies: [cid("linear")],
    hintsUsed: 0,
    fullReveals: 0,
    attempts: 1,
  },
  {
    id: cid("exact"),
    title: "Exact Equations & Integrating Factors",
    description: "Test for exactness M_y = N_x; finding µ to make non-exact equations exact.",
    unit: "Unit 1",
    examWeight: 0.11,
    mastery: 0.45,
    status: "available",
    dependencies: [cid("ode")],
    hintsUsed: 1,
    fullReveals: 0,
    attempts: 3,
  },
  {
    id: cid("hoc"),
    title: "Higher-Order Linear ODEs",
    description: "Constant-coefficient equations, characteristic equation, complementary function.",
    unit: "Unit 2",
    examWeight: 0.18,
    mastery: 0.4,
    status: "available",
    dependencies: [cid("linear")],
    hintsUsed: 0,
    fullReveals: 0,
    attempts: 2,
  },
  {
    id: cid("laplace"),
    title: "Laplace Transforms",
    description: "Definition, properties, inverse transforms, solving IVPs, unit step & impulse.",
    unit: "Unit 3",
    examWeight: 0.19,
    mastery: 0.25,
    status: "available",
    dependencies: [cid("hoc")],
    hintsUsed: 0,
    fullReveals: 0,
    attempts: 0,
  },
  {
    id: cid("ztrans"),
    title: "Z-Transforms",
    description: "Discrete counterpart of Laplace; region of convergence; inverse via partial fractions.",
    unit: "Unit 4",
    examWeight: 0.12,
    mastery: 0,
    status: "locked",
    dependencies: [cid("laplace")],
    hintsUsed: 0,
    fullReveals: 0,
    attempts: 0,
  },
  {
    id: cid("vec"),
    title: "Vector Calculus",
    description: "Gradient, divergence, curl; line & surface integrals; Green's, Stokes', Gauss' theorems.",
    unit: "Unit 5",
    examWeight: 0.0,
    mastery: 0,
    status: "locked",
    dependencies: [cid("ztrans")],
    hintsUsed: 0,
    fullReveals: 0,
    attempts: 0,
  },
];

// Lay out the graph on a soft grid for the topic map.
demoConcepts.forEach((c, i) => {
  const col = i % 3;
  const row = Math.floor(i / 3);
  c.x = 120 + col * 230 + (row % 2) * 60;
  c.y = 90 + row * 190;
});

const demoProblems: PracticeProblem[] = [
  {
    id: pid("b1"),
    conceptId: cid("bern"),
    prompt:
      "Solve the Bernoulli differential equation. Find the general solution, showing each step.",
    latex: "\\dfrac{dy}{dx} + \\dfrac{y}{x} = y^3",
    difficulty: 3,
    source: "past-paper",
    solutionPaths: [
      [
        "Identify n=3 (Bernoulli form y' + P(x)y = Q(x)y^n).",
        "Substitute v = y^{1-n} = y^{-2}, so dv/dx = -2 y^{-3} dy/dx.",
        "Multiply the ODE by -2 y^{-3}: -2 y^{-3} y' - (2/x) y^{-2} = -2.",
        "Replace: dv/dx - (2/x) v = -2, a linear ODE in v.",
        "Integrating factor μ = e^{∫-2/x dx} = x^{-2}.",
        "Multiply through: d/dx(v x^{-2}) = -2 x^{-2}.",
        "Integrate: v x^{-2} = 2/x + C, so v = 2x + C x^2.",
        "Back-substitute v = y^{-2}: y^{-2} = 2x + C x^2.",
        "General solution: y = ±1/√(2x + C x^2).",
      ],
      [
        "Recognise Bernoulli with n=3.",
        "Set u = y^{-2}.",
        "Derive u' - (2/x) u = -2.",
        "Solve linear ODE: u = 2x + C x^2.",
        "Invert: y = (2x + C x^2)^{-1/2}.",
      ],
    ],
    topic: "Bernoulli equations",
  },
  {
    id: pid("b2"),
    conceptId: cid("linear"),
    prompt:
      "Solve the linear first-order ODE. Find y(x) given y(1) = 2.",
    latex: "x\\dfrac{dy}{dx} + 2y = 4x, \\quad y(1)=2",
    difficulty: 2,
    source: "bank",
    solutionPaths: [
      [
        "Divide by x: dy/dx + (2/x) y = 4.",
        "Integrating factor μ = e^{∫2/x dx} = x^2.",
        "Multiply: d/dx(x^2 y) = 4 x^2.",
        "Integrate: x^2 y = (4/3) x^3 + C.",
        "General: y = (4/3) x + C/x^2.",
        "Apply y(1)=2: 2 = 4/3 + C, so C = 2/3.",
        "Solution: y = (4/3) x + (2/3) x^{-2}.",
      ],
    ],
    topic: "Integrating factor",
  },
  {
    id: pid("e1"),
    conceptId: cid("exact"),
    prompt:
      "Determine whether the equation is exact. If so, solve it.",
    latex: "(2xy + 3)\\,dx + (x^2 - 4)\\,dy = 0",
    difficulty: 2,
    source: "bank",
    solutionPaths: [
      [
        "M = 2xy + 3, N = x^2 - 4.",
        "∂M/∂y = 2x, ∂N/∂x = 2x. Exact.",
        "Integrate M wrt x: F = x^2 y + 3x + g(y).",
        "∂F/∂y = x^2 + g'(y) = N = x^2 - 4, so g'(y) = -4.",
        "g(y) = -4y.",
        "Implicit solution: x^2 y + 3x - 4y = C.",
      ],
    ],
    topic: "Exact equations",
  },
];

export const DEMO_WORKSPACE: Workspace = {
  id: "ws-demo",
  name: "Engineering Mathematics",
  examDate: null,
  color: "emerald",
  createdAt: Date.now() - 1000 * 60 * 60 * 26,
  resources: demoResources,
  concepts: demoConcepts,
  problems: demoProblems,
  attempts: [
    {
      id: "att-1",
      problemId: pid("b1"),
      conceptId: cid("bern"),
      steps: [
        {
          id: "s1",
          latex: "n = 3",
          text: "This is Bernoulli with n = 3.",
          confidence: "certain",
          correct: true,
          feedback: "Correct — Bernoulli form identified.",
          errorType: "none",
          checkedAt: Date.now() - 1000 * 60 * 30,
        },
      ],
      startedAt: Date.now() - 1000 * 60 * 35,
      solved: false,
    },
  ],
  theory: [],
  syllabusProgress: 0.34,
};

export const SECONDARY_WORKSPACES_TEMPLATE = (): Workspace[] => [
  {
    id: "ws-phys",
    name: "Engineering Physics",
    examDate: null,
    color: "amber",
    createdAt: Date.now() - 1000 * 60 * 60 * 50,
    resources: [],
    concepts: [],
    problems: [],
    attempts: [],
    theory: [],
    syllabusProgress: 0,
  },
];
