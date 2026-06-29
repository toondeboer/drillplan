import { kmeans } from "ml-kmeans";
import type { Point } from "./types";

/**
 * Find `k` evenly distributed centers among the candidate points using K-Means++,
 * replacing scikit-learn's `KMeans(init='k-means++', n_clusters=k)`.
 */
export function kMeansCenters(points: Point[], k: number): Point[] {
  if (k <= 0) return [];
  if (points.length <= k) {
    // Not enough candidates to cluster: return the points themselves.
    return points.slice(0, k).map((p) => ({ x: p.x, y: p.y }));
  }

  const data = points.map((p) => [p.x, p.y]);
  const result = kmeans(data, k, { initialization: "kmeans++", maxIterations: 100 });

  return result.centroids.map((c) => ({ x: c[0], y: c[1] }));
}
