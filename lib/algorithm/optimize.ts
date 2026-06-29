import type { Point } from "./types";

/**
 * Assignment optimizer. Each candidate center is assigned exactly one measurement
 * type (so two types never share a location), respecting the requested per-type
 * counts. We choose the assignment whose same-type holes are spread the most evenly.
 *
 * Objective — inverse-distance ("Riesz") energy, maximized as its negation so that a
 * higher score is always better:
 *
 *     score = − Σ_t  w_t · Σ_{same-type pairs (i,j) of type t}  1 / d(i,j)
 *     with  w_t = 1 / C(count_t, 2)        (a type with <2 holes contributes nothing)
 *
 * Two deliberate improvements over the legacy `calc_fitness` (which maximized the sum
 * of same-type distances divided by the type's *count*):
 *   - Pairs that are close together are penalized hardest (the 1/d term), which pushes
 *     holes toward an even, well-separated layout instead of toward the site's edges —
 *     the way maximizing raw summed distance tends to. Empirically this gives both a
 *     larger minimum separation and a more uniform nearest-neighbour spacing.
 *   - Normalizing by the number of *pairs* C(count_t, 2) — rather than the count —
 *     weights every type comparably, so a type with many holes no longer dominates the
 *     objective and starve a type with few holes.
 * This means results intentionally differ from the legacy reference script.
 *
 * Search strategy: iterated local search. We hill-climb by swapping the types of two
 * centers, and each swap is evaluated in O(n) via `swapDelta` (only the pairs touching
 * the two swapped centers change), instead of recomputing the full O(n²) score. When a
 * local optimum is reached we "kick" the best-so-far with a few random swaps and climb
 * again. This explores the assignment space far more effectively than scoring many
 * independent random assignments from scratch.
 */

export interface OptimizeOptions {
  iterations: number;
  refine: boolean;
  onProgress?: (fraction: number) => void;
}

export interface OptimizeResult {
  /** typeIndex per center. */
  assignment: Int32Array;
  score: number;
}

function shuffle(array: Int32Array): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = array[i];
    array[i] = array[j];
    array[j] = tmp;
  }
}

/** Random assignment of `counts` types across all centers (one type per center). */
function randomAssignment(counts: number[], total: number, order: Int32Array): Int32Array {
  shuffle(order);
  const assign = new Int32Array(total);
  let k = 0;
  for (let t = 0; t < counts.length; t++) {
    for (let c = 0; c < counts[t]; c++) {
      assign[order[k++]] = t;
    }
  }
  return assign;
}

/**
 * Pre-compute the symmetric per-pair value matrix once (centers are fixed): the inverse
 * distance 1/d between every pair. `d` is clamped away from zero so coincident centers
 * (a degenerate K-Means outcome) yield a large finite penalty rather than Infinity/NaN.
 */
function pairValueMatrix(centers: Point[]): Float64Array {
  const n = centers.length;
  const pv = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = centers[i].x - centers[j].x;
      const dy = centers[i].y - centers[j].y;
      const v = 1 / Math.max(Math.sqrt(dx * dx + dy * dy), 1e-9);
      pv[i * n + j] = v;
      pv[j * n + i] = v;
    }
  }
  return pv;
}

/** Per-type weight 1 / C(count, 2). Types with fewer than two holes have no pairs. */
function typeWeights(counts: number[]): Float64Array {
  const w = new Float64Array(counts.length);
  for (let t = 0; t < counts.length; t++) {
    const c = counts[t];
    w[t] = c < 2 ? 0 : 1 / ((c * (c - 1)) / 2);
  }
  return w;
}

/** Full O(n²) spread score. Used for the initial seed and exact (drift-free) resyncs. */
function score(pv: Float64Array, assign: Int32Array, weights: Float64Array, n: number): number {
  let f = 0;
  for (let i = 0; i < n; i++) {
    const ti = assign[i];
    for (let j = i + 1; j < n; j++) {
      if (ti === assign[j]) {
        f -= weights[ti] * pv[i * n + j];
      }
    }
  }
  return f;
}

/**
 * Change in `score` from swapping the types of centers `i` and `j` (which must
 * currently hold different types). Only pairs that include `i` or `j` change, so this
 * is O(n) instead of recomputing the whole O(n²) score. The (i, j) pair itself stays
 * cross-type before and after the swap, so it never contributes.
 */
function swapDelta(
  pv: Float64Array,
  assign: Int32Array,
  weights: Float64Array,
  n: number,
  i: number,
  j: number,
): number {
  const ti = assign[i];
  const tj = assign[j];
  const wi = weights[ti];
  const wj = weights[tj];
  const ri = i * n;
  const rj = j * n;
  let delta = 0;
  for (let k = 0; k < n; k++) {
    if (k === i || k === j) continue;
    const tk = assign[k];
    if (tk === ti) {
      // k leaves i's company and joins j's.
      delta += wi * (pv[ri + k] - pv[rj + k]);
    } else if (tk === tj) {
      // k leaves j's company and joins i's.
      delta += wj * (pv[rj + k] - pv[ri + k]);
    }
  }
  return delta;
}

/**
 * Greedy hill-climb: propose random swaps and apply the strictly-improving ones,
 * stopping once `patience` consecutive proposals fail to improve. Delta-evaluated, so
 * each proposal is O(n). Returns the exact (recomputed) score of the final assignment.
 */
function hillClimb(
  pv: Float64Array,
  assign: Int32Array,
  weights: Float64Array,
  n: number,
): { assignment: Int32Array; score: number } {
  const patience = Math.max(50, n * n);
  let noImprove = 0;
  while (noImprove < patience) {
    const i = Math.floor(Math.random() * n);
    const j = Math.floor(Math.random() * n);
    if (i === j || assign[i] === assign[j]) {
      noImprove++;
      continue;
    }
    const delta = swapDelta(pv, assign, weights, n, i, j);
    if (delta > 0) {
      const ti = assign[i];
      assign[i] = assign[j];
      assign[j] = ti;
      noImprove = 0;
    } else {
      noImprove++;
    }
  }
  return { assignment: assign, score: score(pv, assign, weights, n) };
}

export function optimize(
  centers: Point[],
  counts: number[],
  options: OptimizeOptions,
): OptimizeResult {
  const n = centers.length;
  const total = counts.reduce((a, b) => a + b, 0);
  if (n !== total) {
    throw new Error(`Expected ${total} centers but got ${n}.`);
  }

  const pv = pairValueMatrix(centers);
  const weights = typeWeights(counts);
  const order = new Int32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;

  // Total number of swap proposals. Each is O(n) now (delta-evaluated), so this budget
  // buys far more exploration than the old O(n²)-per-sample random search did.
  const budget = Math.max(1, options.iterations);

  // Working assignment + its running score (kept in sync incrementally, resynced exactly
  // on every kick so floating-point drift can never accumulate across basins).
  const assign = randomAssignment(counts, total, order);
  let current = score(pv, assign, weights, n);

  // Best within the current local-search basin, and best ever found (always exact).
  let localBest = current;
  const localBestAssign = assign.slice();
  let best = current;
  const bestAssign = assign.slice();

  // How long we wander without improvement before kicking out of a local optimum, and
  // how many random swaps the kick applies. Both scale with the problem size.
  const patience = Math.max(20, n * n);
  const kick = Math.max(1, Math.floor(n / 10));

  const reportEvery = Math.max(1, Math.floor(budget / 100));
  let noImprove = 0;

  for (let it = 0; it < budget; it++) {
    const i = Math.floor(Math.random() * n);
    const j = Math.floor(Math.random() * n);
    if (i !== j && assign[i] !== assign[j]) {
      const delta = swapDelta(pv, assign, weights, n, i, j);
      if (delta > 0) {
        const ti = assign[i];
        assign[i] = assign[j];
        assign[j] = ti;
        current += delta;
        if (current > localBest) {
          localBest = current;
          localBestAssign.set(assign);
        }
        noImprove = 0;
      } else {
        noImprove++;
      }
    }

    // Stuck at a local optimum: bank the basin's best (exactly scored), then perturb the
    // global best and climb again — the "iterated" part of iterated local search.
    if (noImprove >= patience) {
      const exact = score(pv, localBestAssign, weights, n);
      if (exact > best) {
        best = exact;
        bestAssign.set(localBestAssign);
      }
      assign.set(bestAssign);
      for (let s = 0; s < kick; s++) {
        const ki = Math.floor(Math.random() * n);
        const kj = Math.floor(Math.random() * n);
        if (ki !== kj && assign[ki] !== assign[kj]) {
          const tki = assign[ki];
          assign[ki] = assign[kj];
          assign[kj] = tki;
        }
      }
      current = score(pv, assign, weights, n);
      localBest = current;
      localBestAssign.set(assign);
      noImprove = 0;
    }

    if (options.onProgress && it % reportEvery === 0) {
      options.onProgress(it / budget);
    }
  }
  if (options.onProgress) options.onProgress(1);

  // Fold in the final basin.
  const finalExact = score(pv, localBestAssign, weights, n);
  if (finalExact > best) {
    best = finalExact;
    bestAssign.set(localBestAssign);
  }

  // Optional final polish: greedy hill-climb from the best until it stops improving.
  if (options.refine) {
    const polished = hillClimb(pv, bestAssign.slice(), weights, n);
    if (polished.score > best) {
      best = polished.score;
      bestAssign.set(polished.assignment);
    }
  }

  return { assignment: bestAssign, score: best };
}
