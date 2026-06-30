import type { Point } from "./algorithm/types";

/**
 * Generate a random but plausible site outline for the "Try an example" / "Download
 * example CSV" features. Each call returns a differently-shaped area.
 *
 * Uses a star-shaped (radial) construction: vertices are placed at sorted angles
 * around a center, each at a randomized radius. Because the angles are sorted, the
 * resulting polygon is always simple (non-self-intersecting). An anisotropic x/y
 * scale keeps shapes from always looking round.
 *
 * Coordinates sit in the Dutch RD / EPSG:28992 region (~155000 / 463000) so the
 * graticule labels and the "RD · EPSG:28992" chip stay believable.
 */

// Center of the RD region the original sample lived in, with a little jitter so the
// example doesn't always sit in exactly the same place.
const BASE_X = 155000;
const BASE_Y = 463000;

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function generateExamplePolygon(): Point[] {
  const vertexCount = Math.floor(rand(6, 13)); // 6..12 vertices
  const baseRadius = rand(150, 400); // metres
  const aspectX = rand(0.65, 1.4);
  const aspectY = rand(0.65, 1.4);
  const cx = BASE_X + rand(-120, 120);
  const cy = BASE_Y + rand(-120, 120);
  const rotation = rand(0, Math.PI * 2);

  const step = (Math.PI * 2) / vertexCount;
  const jitter = step * 0.4; // keep angles ordered so the polygon stays simple

  const polygon: Point[] = [];
  for (let i = 0; i < vertexCount; i++) {
    const angle = rotation + i * step + rand(-jitter, jitter);
    const radius = baseRadius * rand(0.55, 1.3);
    const x = cx + Math.cos(angle) * radius * aspectX;
    const y = cy + Math.sin(angle) * radius * aspectY;
    polygon.push({ x, y });
  }
  return polygon;
}
