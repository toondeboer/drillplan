import type { Point } from "./types";

export interface KMeansHistory {
  /** Final cluster centers. */
  centers: Point[];
  /**
   * Centroid positions per Lloyd iteration. `frames[0]` is the k-means++ seeding,
   * each subsequent frame is one update step, and the last frame equals `centers`.
   * Used to animate the clustering.
   */
  frames: Point[][];
}

const MAX_ITERATIONS = 100;
/** Stop once no centroid moves more than this (squared) between iterations. */
const EPSILON_SQ = 1e-7;

function nearestCenter(p: Point, centers: Point[]): number {
  let best = 0;
  let bestDist = Infinity;
  for (let c = 0; c < centers.length; c++) {
    const dx = p.x - centers[c].x;
    const dy = p.y - centers[c].y;
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

/**
 * K-Means++ seeding: pick the first center at random, then each subsequent center
 * with probability proportional to its squared distance from the nearest chosen
 * center. Mirrors scikit-learn's `init='k-means++'`.
 */
function seedKMeansPlusPlus(points: Point[], k: number): Point[] {
  const centers: Point[] = [];
  const first = Math.floor(Math.random() * points.length);
  centers.push({ x: points[first].x, y: points[first].y });

  const dist2 = new Float64Array(points.length).fill(Infinity);
  while (centers.length < k) {
    const last = centers[centers.length - 1];
    let total = 0;
    for (let i = 0; i < points.length; i++) {
      const dx = points[i].x - last.x;
      const dy = points[i].y - last.y;
      const d = dx * dx + dy * dy;
      if (d < dist2[i]) dist2[i] = d;
      total += dist2[i];
    }
    // Choose the next seed weighted by squared distance.
    let target = Math.random() * total;
    let chosen = points.length - 1;
    for (let i = 0; i < points.length; i++) {
      target -= dist2[i];
      if (target <= 0) {
        chosen = i;
        break;
      }
    }
    centers.push({ x: points[chosen].x, y: points[chosen].y });
  }
  return centers;
}

/**
 * Custom Lloyd's k-means that records the centroid positions at every iteration,
 * replacing scikit-learn's `KMeans(init='k-means++', n_clusters=k)`. The recorded
 * `frames` let the UI animate the clustering, and the final `centers` are the exact
 * values used for placement.
 */
export function kMeansWithHistory(points: Point[], k: number): KMeansHistory {
  if (k <= 0) return { centers: [], frames: [] };
  if (points.length <= k) {
    // Not enough candidates to cluster: return the points themselves.
    const centers = points.slice(0, k).map((p) => ({ x: p.x, y: p.y }));
    return { centers, frames: [centers.map((c) => ({ ...c }))] };
  }

  let centers = seedKMeansPlusPlus(points, k);
  const frames: Point[][] = [centers.map((c) => ({ ...c }))];

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const sumX = new Float64Array(k);
    const sumY = new Float64Array(k);
    const count = new Int32Array(k);
    for (const p of points) {
      const c = nearestCenter(p, centers);
      sumX[c] += p.x;
      sumY[c] += p.y;
      count[c]++;
    }

    let moved = 0;
    const next: Point[] = centers.map((prev, c) => {
      // Keep an empty cluster where it was to avoid NaN centroids.
      if (count[c] === 0) return { x: prev.x, y: prev.y };
      const nx = sumX[c] / count[c];
      const ny = sumY[c] / count[c];
      const dx = nx - prev.x;
      const dy = ny - prev.y;
      moved = Math.max(moved, dx * dx + dy * dy);
      return { x: nx, y: ny };
    });

    centers = next;
    frames.push(centers.map((c) => ({ ...c })));
    if (moved < EPSILON_SQ) break;
  }

  return { centers, frames };
}

/**
 * Find `k` evenly distributed centers among the candidate points using K-Means++.
 * Thin wrapper over {@link kMeansWithHistory} preserving the original signature and
 * edge-case behavior.
 */
export function kMeansCenters(points: Point[], k: number): Point[] {
  return kMeansWithHistory(points, k).centers;
}
