import { describe, it, expect, vi, afterEach } from "vitest";
import {
  optimize,
  score,
  swapDelta,
  pairValueMatrix,
  typeWeights,
} from "./optimize";
import type { Point } from "./types";

/** Deterministic PRNG (mulberry32) so randomized tests are reproducible. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("pairValueMatrix", () => {
  it("is symmetric with a zero diagonal and 1/d off-diagonal", () => {
    const centers: Point[] = [
      { x: 0, y: 0 },
      { x: 3, y: 4 }, // distance 5 from the first
    ];
    const pv = pairValueMatrix(centers);
    const n = 2;
    expect(pv[0 * n + 0]).toBe(0);
    expect(pv[1 * n + 1]).toBe(0);
    expect(pv[0 * n + 1]).toBeCloseTo(1 / 5, 12);
    expect(pv[1 * n + 0]).toBeCloseTo(1 / 5, 12); // symmetric
  });

  it("clamps coincident centers to a large finite value, never Infinity/NaN", () => {
    const centers: Point[] = [
      { x: 1, y: 1 },
      { x: 1, y: 1 },
    ];
    const pv = pairValueMatrix(centers);
    const v = pv[0 * 2 + 1];
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBeCloseTo(1 / 1e-9, 0); // 1e9
  });
});

describe("typeWeights", () => {
  it("weights as 1 / C(count, 2), with 0 for counts below 2", () => {
    const w = typeWeights([0, 1, 2, 3, 4]);
    expect(Array.from(w)).toEqual([0, 0, 1, 1 / 3, 1 / 6]);
  });
});

describe("score", () => {
  it("matches a hand-computed small example", () => {
    // type 0 at indices 0 and 2 (distance 10 apart), type 1 at index 1.
    const centers: Point[] = [
      { x: 0, y: 0 },
      { x: 3, y: 4 },
      { x: 10, y: 0 },
    ];
    const counts = [2, 1];
    const assign = Int32Array.from([0, 1, 0]);
    const pv = pairValueMatrix(centers);
    const weights = typeWeights(counts); // [1, 0]
    // Only same-type pair is (0,2): pv = 1/10, weight = 1 -> score = -0.1
    expect(score(pv, assign, weights, 3)).toBeCloseTo(-0.1, 12);
  });
});

describe("swapDelta", () => {
  it("equals the exact change in score across many randomized swaps", () => {
    const rng = makeRng(123);
    for (let trial = 0; trial < 300; trial++) {
      const n = 2 + Math.floor(rng() * 7); // 2..8 centers
      const m = 2 + Math.floor(rng() * 3); // 2..4 types
      const centers: Point[] = [];
      for (let c = 0; c < n; c++) {
        centers.push({ x: rng() * 100, y: rng() * 100 });
      }
      const assign = new Int32Array(n);
      for (let c = 0; c < n; c++) assign[c] = Math.floor(rng() * m);

      // Pick a pair with differing types; skip the (rare) trial if none.
      let i = Math.floor(rng() * n);
      let j = Math.floor(rng() * n);
      if (i === j || assign[i] === assign[j]) {
        let found = false;
        outer: for (let a = 0; a < n; a++) {
          for (let b = a + 1; b < n; b++) {
            if (assign[a] !== assign[b]) {
              i = a;
              j = b;
              found = true;
              break outer;
            }
          }
        }
        if (!found) continue;
      }

      const counts = new Array(m).fill(0);
      for (let c = 0; c < n; c++) counts[assign[c]]++;
      const pv = pairValueMatrix(centers);
      const weights = typeWeights(counts);

      const before = score(pv, assign, weights, n);
      const delta = swapDelta(pv, assign, weights, n, i, j);
      const ti = assign[i];
      assign[i] = assign[j];
      assign[j] = ti;
      const after = score(pv, assign, weights, n);

      expect(after - before).toBeCloseTo(delta, 6);
    }
  });
});

describe("optimize", () => {
  const corners: Point[] = [
    { x: 0, y: 0 }, // 0
    { x: 1, y: 0 }, // 1
    { x: 1, y: 1 }, // 2
    { x: 0, y: 1 }, // 3
  ];

  it("throws when the number of centers does not match the total count", () => {
    expect(() => optimize(corners.slice(0, 3), [2, 2], { iterations: 10, refine: false })).toThrow();
  });

  it("returns an assignment that respects the per-type counts", () => {
    const centers: Point[] = [];
    for (let i = 0; i < 8; i++) centers.push({ x: i * 3, y: (i % 4) * 5 });
    const counts = [3, 2, 2, 1];
    const { assignment } = optimize(centers, counts, { iterations: 500, refine: true });

    expect(assignment).toHaveLength(8);
    const histogram = new Array(counts.length).fill(0);
    for (const t of assignment) {
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThan(counts.length);
      histogram[t]++;
    }
    expect(histogram).toEqual(counts);
  });

  it("returns a finite score that matches a fresh full recompute (no drift)", () => {
    const centers: Point[] = [];
    for (let i = 0; i < 8; i++) centers.push({ x: i * 7, y: (i * 13) % 50 });
    const counts = [3, 3, 2, 0];
    const result = optimize(centers, counts, { iterations: 800, refine: true });

    expect(Number.isFinite(result.score)).toBe(true);
    const recomputed = score(
      pairValueMatrix(centers),
      result.assignment,
      typeWeights(counts),
      centers.length,
    );
    expect(result.score).toBeCloseTo(recomputed, 9);
  });

  it("is deterministic when Math.random is seeded identically", () => {
    const counts = [2, 2];
    vi.spyOn(Math, "random").mockImplementation(makeRng(42));
    const r1 = optimize(corners, counts, { iterations: 500, refine: true });
    vi.spyOn(Math, "random").mockImplementation(makeRng(42));
    const r2 = optimize(corners, counts, { iterations: 500, refine: true });

    expect(Array.from(r1.assignment)).toEqual(Array.from(r2.assignment));
    expect(r1.score).toBe(r2.score);
  });

  it("finds the known optimum: diagonal pairing of unit-square corners", () => {
    // counts [2,2]: pairing each type as a diagonal (far apart) beats adjacent pairs.
    const { assignment } = optimize(corners, [2, 2], { iterations: 2000, refine: true });
    // Diagonals are {0,2} and {1,3}.
    expect(assignment[0]).toBe(assignment[2]);
    expect(assignment[1]).toBe(assignment[3]);
    expect(assignment[0]).not.toBe(assignment[1]);
  });
});
