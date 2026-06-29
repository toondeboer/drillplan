import type { Point } from "./types";

/**
 * Ray-casting point-in-polygon test. Replaces shapely's `poly.contains(Point)`
 * from the legacy script.
 */
export function pointInPolygon(x: number, y: number, polygon: Point[]): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export function getBounds(polygon: Point[]): Bounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of polygon) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY };
}

/**
 * Sample an evenly spaced grid over the polygon's bounding box and keep only the
 * points that fall inside it. Mirrors the grid loop in the legacy `k_means`.
 *
 * `onProgress` is called with a 0..1 fraction as columns are processed.
 */
export function sampleInteriorGrid(
  polygon: Point[],
  resolution: number,
  onProgress?: (fraction: number) => void,
): Point[] {
  const { minX, maxX, minY, maxY } = getBounds(polygon);
  const points: Point[] = [];
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  for (let i = 0; i <= resolution; i++) {
    const x = minX + (spanX * i) / resolution;
    for (let j = 0; j <= resolution; j++) {
      const y = minY + (spanY * j) / resolution;
      if (pointInPolygon(x, y, polygon)) points.push({ x, y });
    }
    if (onProgress && i % 8 === 0) onProgress(i / resolution);
  }
  if (onProgress) onProgress(1);
  return points;
}
