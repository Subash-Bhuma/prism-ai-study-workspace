import { db } from "./db";

// Realistic extracted-text excerpts for the demo workspace's seeded resources.
// These are the texts the AI actually reads when mapping the curriculum —
// so "Re-map curriculum" works out of the box, and new uploads add to them.

const DEMO_EXTRACTED: {
  name: string;
  kind: string;
  status: string;
  note: string;
  pages: number | null;
  sizeKb: number;
  text: string;
}[] = [
  {
    name: "Advanced Engineering Mathematics — Erwin Kreyszig (Ch. 1-4)",
    kind: "textbook",
    status: "parsed",
    note: "Parsed cleanly. 4 chapters indexed.",
    pages: 412,
    sizeKb: 18420,
    text: `ADVANCED ENGINEERING MATHEMATICS — Erwin Kreyszig, Chapters 1-4

CHAPTER 1: First-Order ODEs
A first-order ordinary differential equation is of the form F(x, y, y') = 0. We classify solutions by method:
- Separable equations: g(y) dy = f(x) dx. Integrate both sides.
- Linear first-order ODEs: y' + p(x) y = r(x). Standard form. The integrating factor is mu(x) = exp(∫ p(x) dx). Multiplying through gives (mu y)' = mu r, hence y = (1/mu)(∫ mu r dx + C).
- Bernoulli equation: y' + p(x) y = g(x) y^n (n ≠ 0, 1). Substitute v = y^{1-n}; this reduces the Bernoulli equation to a LINEAR ODE in v: v' + (1-n) p v = (1-n) g. Solve with the integrating factor, then back-substitute. This substitution is the key technique examiners expect.
- Exact equations: M(x,y) dx + N(x,y) dy = 0 is exact iff ∂M/∂y = ∂N/∂x. Then a potential F exists with F_x = M, F_y = N, and the implicit solution is F = C. Non-exact equations can sometimes be made exact by an integrating factor.

CHAPTER 2: Second-Order Linear ODEs
Homogeneous with constant coefficients: y'' + a y' + b y = 0. Characteristic equation r^2 + a r + b = 0. Three cases — distinct real roots, double root, complex roots. The complementary function y_c is built from these.
Nonhomogeneous: y = y_c + y_p. Find y_p by undetermined coefficients or variation of parameters.

CHAPTER 3: Higher-Order Linear ODEs
Extension to order n. Characteristic equation of degree n. Linear independence via the Wronskian.

CHAPTER 4: Systems of ODEs
Vector form x' = A x. Eigenvalue method.`,
  },
  {
    name: "Prof. Sharma — Differential Equations (handwritten scans)",
    kind: "photo",
    status: "ocr-low",
    note: "OCR confidence low past page 12 — re-upload a clearer scan or proceed anyway.",
    pages: 38,
    sizeKb: 9820,
    text: `PROF. SHARMA — Differential Equations, handwritten notes (OCR transcribed, partial)

Unit 1. First order ODE. Separable: dy/dx = f(x)/g(y). [illegible] ... linear eqn y' + P(x)y = Q(x), integrating factor IF = e^{∫P dx}. Multiply both sides, LHS becomes d/dx(IF · y).

Bernoulli: y' + Py = Q y^n. Put v = y^{1-n}. Then [illegible] ... reduces to linear in v. VERY IMPORTANT for exam — appeared 2019, 2021, 2023.

Exact: M dx + N dy = 0, exact if M_y = N_x. Solve by partial integration. [illegible]

Unit 2. Higher order linear, constant coeff. Aux eqn. CF cases. [illegible] ... 2022 paper Q3(b) ... [illegible]`,
  },
  {
    name: "Question Bank — MA8353 (2020-2024)",
    kind: "question-bank",
    status: "parsed",
    note: "216 problems indexed, 84 tagged to past papers.",
    pages: 96,
    sizeKb: 4210,
    text: `QUESTION BANK — MA8353 Transforms and Partial Differential Equations (2020-2024)

UNIT 1 — PARTIAL DIFFERENTIAL EQUATIONS
Q1. Form the partial differential equation by eliminating arbitrary constants a and b from z = (x^2 + a^2)(y^2 + b^2).
Q2. Solve the PDE: x(y - z) p + y(z - x) q = z(x - y). [Lagrange's method]
Q3. Solve p^2 + q^2 = 1 using Charpit's method.
Q4. Solve the wave equation ∂²u/∂t² = c² ∂²u/∂x² with u(0,t)=u(l,t)=0, u(x,0)=f(x).
Q5. One-dimensional heat equation ∂u/∂t = α² ∂²u/∂x², steady state solution.

UNIT 2 — FOURIER SERIES
Q6. Obtain the Fourier series for f(x) = x^2 in (-π, π) and deduce Σ 1/n² = π²/6.
Q7. Half-range expansions: sine and cosine series for f(x) = x in (0, l).
Q8. Parseval's identity applications.

UNIT 3 — APPLICATIONS OF PDE
Q9. Vibrating string — solution by separation of variables.
Q10. Heat conduction in a rod — steady and transient.

UNIT 4 — FOURIER TRANSFORM
Q11. Find the Fourier transform of e^{-x²}. Convolution theorem.
Q12. Parseval's identity for Fourier transforms.

UNIT 5 — Z-TRANSFORM
Q13. Find the Z-transform of a^n u(n). Region of convergence.
Q14. Inverse Z-transform by partial fractions.
Q15. Solve the difference equation y(n+2) - 5y(n+1) + 6y(n) = 0 using Z-transforms.

[84 of these problems are tagged to specific past papers — frequency analysis drives the exam weighting.]`,
  },
  {
    name: "Past Papers — Nov 2023, May 2023, Nov 2022",
    kind: "past-paper",
    status: "parsed",
    note: "Frequency analysis complete. Exam weighting derived from these.",
    pages: 18,
    sizeKb: 2110,
    text: `PAST PAPERS — MA8353 (Nov 2022, May 2023, Nov 2023)

NOV 2023:
Part A: (1) Form PDE by eliminating arbitrary function. (2) State Parseval's identity. (3) Define Z-transform.
Part B: (4) Solve Bernoulli equation dy/dx + (1/x) y = y^3. [12 marks]  (5) Find Fourier series for f(x)=x² in (-π,π). (6) Solve heat equation ∂u/∂t = ∂²u/∂x², 0<x<π.

MAY 2023:
(1) Solve x(y-z)p + y(z-x)q = z(x-y). (2) Bernoulli: dy/dx + y = x y². (3) Z-transform of a^n. (4) Fourier transform of e^{-x²}. (5) Wave equation with initial displacement.

NOV 2022:
(1) Integrating factor for linear ODE. (2) Exact equation (2xy+3)dx + (x²-4)dy = 0. (3) Charpit's method. (4) Half-range sine series. (5) Inverse Z-transform by partial fractions.

FREQUENCY ANALYSIS (across the 3 papers):
- First-order ODEs (Bernoulli, linear, exact): appeared 6 times → HIGH weight
- Fourier series (incl. half-range, Parseval): appeared 5 times → HIGH weight
- PDE (wave/heat, Lagrange, Charpit): appeared 5 times → HIGH weight
- Z-transforms: appeared 3 times → MEDIUM weight
- Fourier transform: appeared 2 times → MEDIUM-LOW weight`,
  },
  {
    name: "Syllabus — MA8353 (regulation 2017)",
    kind: "syllabus",
    status: "gap",
    note: "Looks like a gap between Unit 3 and Unit 5 — no material covers Z-transforms fully.",
    pages: null,
    sizeKb: 320,
    text: `MA8353 — TRANSFORMS AND PARTIAL DIFFERENTIAL EQUATIONS (Regulation 2017)

UNIT I: PARTIAL DIFFERENTIAL EQUATIONS
Formation, solution of standard types, Lagrange's linear equation, Charpit's method.

UNIT II: FOURIER SERIES
Dirichlet's conditions, full-range and half-range expansions, Parseval's identity, harmonic analysis.

UNIT III: APPLICATIONS OF PARTIAL DIFFERENTIAL EQUATIONS
One-dimensional wave equation, one-dimensional heat equation, steady-state two-dimensional heat.

UNIT IV: FOURIER TRANSFORMS
Infinite Fourier transform, sine & cosine transforms, inverse, convolution, Parseval's identity.

UNIT V: Z-TRANSFORMS AND DIFFERENCE EQUATIONS
Z-transform, properties, inverse, solution of difference equations.

NOTE: The uploaded material covers Units I-IV well. UNIT V (Z-transforms) has only a question bank — no textbook chapter or notes uploaded. This is the gap.`,
  },
];

export const DEMO_WORKSPACE_ID = "ws-demo";

// Guard against concurrent seeding (two hydrate calls racing on first load).
const seeding = new Map<string, Promise<void>>();

/** Seed the demo workspace's resources into the DB if none exist yet. */
export async function seedDemoResourcesIfEmpty(workspaceId: string) {
  const count = await db.resource.count({ where: { workspaceId } });
  if (count > 0) return;

  // Dedupe concurrent calls for the same workspace.
  const inFlight = seeding.get(workspaceId);
  if (inFlight) return inFlight;

  const p = (async () => {
    // re-check inside the lock — another caller may have just finished.
    const c2 = await db.resource.count({ where: { workspaceId } });
    if (c2 > 0) return;
    for (const r of DEMO_EXTRACTED) {
      await db.resource.create({
        data: {
          workspaceId,
          name: r.name,
          kind: r.kind,
          status: r.status,
          note: r.note,
          pages: r.pages,
          sizeKb: r.sizeKb,
          extractedText: r.text,
          filePath: null, // seeded — no real file on disk
        },
      });
    }
  })();
  seeding.set(workspaceId, p);
  try {
    await p;
  } finally {
    seeding.delete(workspaceId);
  }
}
