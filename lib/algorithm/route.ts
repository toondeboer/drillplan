import type { Placement, RouteOptions, RoutePlan } from "./types";

/**
 * Order drill holes into the shortest drilling route (the Traveling Salesman Problem).
 *
 * This is a classic optimization heuristic — not machine learning — in two stages:
 *   1. Nearest-neighbor construction: from the start hole, greedily hop to the closest
 *      unvisited hole until all are visited. Fast, but leaves crossing detours.
 *   2. 2-opt improvement: repeatedly find two route edges that cross / are wastefully
 *      long, cut them and reconnect the other way so they uncross, shortening the total.
 *      Repeat until no swap helps. Near-optimal for the modest hole counts here.
 *
 * The returned placements are reordered along the route and renumbered "001", "002", …
 * so the exported CSV can be drilled top-to-bottom. `steps`/`lengths` record the
 * algorithm's progress so the UI can animate it.
 */
export function optimizeRoute(placements: Placement[], opts: RouteOptions): RoutePlan {
  const n = placements.length;
  const roundTrip = opts.roundTrip;

  // Nothing to route.
  if (n <= 1) {
    const order = n === 0 ? [] : [0];
    return {
      placements: renumber(placements, order),
      order,
      length: 0,
      roundTrip,
      steps: [order.slice()],
      lengths: [0],
    };
  }

  // Symmetric distance matrix (Euclidean; coordinates are a flat plane).
  const D: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = Math.hypot(placements[i].x - placements[j].x, placements[i].y - placements[j].y);
      D[i][j] = d;
      D[j][i] = d;
    }
  }

  const start = clampIndex(opts.startIndex, n) ?? northernmostIndex(placements);
  let end = roundTrip ? null : clampIndex(opts.endIndex, n);
  if (end === start) end = null; // a start==end open path is degenerate; free the end

  // 1. Nearest-neighbor draft.
  const order = nearestNeighborOrder(n, start, end, D);

  const steps: number[][] = [order.slice()];
  const lengths: number[] = [routeLength(order, roundTrip, D)];
  const record = () => {
    steps.push(order.slice());
    lengths.push(routeLength(order, roundTrip, D));
  };

  // 2. 2-opt untangling.
  if (roundTrip) twoOptCycle(order, D, record);
  else twoOptPath(order, D, end != null, record);

  return {
    placements: renumber(placements, order),
    order,
    length: lengths[lengths.length - 1],
    roundTrip,
    steps,
    lengths,
  };
}

/** Index of the north-most (largest y) placement; 0 when empty. */
export function northernmostIndex(placements: Placement[]): number {
  let best = 0;
  for (let i = 1; i < placements.length; i++) {
    if (placements[i].y > placements[best].y) best = i;
  }
  return best;
}

// ── internals ─────────────────────────────────────────────────────────────────

function clampIndex(idx: number | null, n: number): number | null {
  if (idx == null) return null;
  return idx >= 0 && idx < n ? idx : null;
}

/** Total route length; adds the closing edge back to the start on a round trip. */
function routeLength(order: number[], roundTrip: boolean, D: number[][]): number {
  let len = 0;
  for (let i = 0; i + 1 < order.length; i++) len += D[order[i]][order[i + 1]];
  if (roundTrip && order.length > 1) len += D[order[order.length - 1]][order[0]];
  return len;
}

/**
 * Greedy nearest-neighbor visiting order from `start`. A fixed `end` (open path only) is
 * reserved and appended last so it stays the final hole.
 */
function nearestNeighborOrder(
  n: number,
  start: number,
  end: number | null,
  D: number[][],
): number[] {
  const visited = new Array<boolean>(n).fill(false);
  const order = [start];
  visited[start] = true;
  const reserveEnd = end != null && end !== start;
  if (reserveEnd) visited[end] = true;
  const target = n - (reserveEnd ? 1 : 0);

  let current = start;
  while (order.length < target) {
    let best = -1;
    let bestD = Infinity;
    for (let j = 0; j < n; j++) {
      if (visited[j]) continue;
      if (D[current][j] < bestD) {
        bestD = D[current][j];
        best = j;
      }
    }
    if (best < 0) break;
    visited[best] = true;
    order.push(best);
    current = best;
  }
  if (reserveEnd) order.push(end);
  return order;
}

function reverseSegment(order: number[], i: number, j: number): void {
  while (i < j) {
    const t = order[i];
    order[i] = order[j];
    order[j] = t;
    i++;
    j--;
  }
}

const EPS = 1e-9;

/**
 * 2-opt on a closed loop. Position 0 (the start) is pinned; reversing an interior segment
 * covers every distinct cyclic 2-opt neighbour. `onImprove` fires after each accepted swap.
 */
function twoOptCycle(order: number[], D: number[][], onImprove: () => void): void {
  const n = order.length;
  if (n < 4) return;
  let improved = true;
  let guard = 0;
  const maxGuard = n * n * 20;
  while (improved && guard++ < maxGuard) {
    improved = false;
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = order[i];
        const b = order[i + 1];
        const c = order[j];
        const d = order[(j + 1) % n];
        if (a === c || b === d) continue;
        if (D[a][c] + D[b][d] + EPS < D[a][b] + D[c][d]) {
          reverseSegment(order, i + 1, j);
          onImprove();
          improved = true;
        }
      }
    }
  }
}

/**
 * 2-opt on an open path. Position 0 (the start) is always pinned; when `fixedEnd` is set
 * the last position is pinned too, otherwise the endpoint may move (the closing term drops
 * when the reversed segment reaches the tail). `onImprove` fires after each accepted swap.
 */
function twoOptPath(
  order: number[],
  D: number[][],
  fixedEnd: boolean,
  onImprove: () => void,
): void {
  const n = order.length;
  if (n < 3) return;
  const jMax = fixedEnd ? n - 2 : n - 1;
  let improved = true;
  let guard = 0;
  const maxGuard = n * n * 20;
  while (improved && guard++ < maxGuard) {
    improved = false;
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j <= jMax; j++) {
        const a = order[i];
        const b = order[i + 1];
        const c = order[j];
        const hasNext = j + 1 < n;
        const d = hasNext ? order[j + 1] : -1;
        const before = D[a][b] + (hasNext ? D[c][d] : 0);
        const after = D[a][c] + (hasNext ? D[b][d] : 0);
        if (after + EPS < before) {
          reverseSegment(order, i + 1, j);
          onImprove();
          improved = true;
        }
      }
    }
  }
}

/** Reorder placements along `order` and renumber them "001", "002", … (drilling order). */
function renumber(placements: Placement[], order: number[]): Placement[] {
  return order.map((originalIndex, i) => ({
    ...placements[originalIndex],
    id: String(i + 1).padStart(3, "0"),
  }));
}
