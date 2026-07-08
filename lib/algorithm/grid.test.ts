import { describe, it, expect } from "vitest";
import { computeGrid } from "./grid";
import { pointInPolygon } from "./geometry";
import type { Point } from "./types";

const square: Point[] = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

// An L-shape (concave) to exercise a non-rectangular contour.
const lShape: Point[] = [
  { x: 0, y: 0 },
  { x: 60, y: 0 },
  { x: 60, y: 30 },
  { x: 30, y: 30 },
  { x: 30, y: 60 },
  { x: 0, y: 60 },
];

/** Lattice coordinates (a, b) of a world point for the given arrangement. */
function latticeCoords(p: Point, origin: Point, spacing: number, angle: number) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  return {
    a: (dx * cos + dy * sin) / spacing,
    b: (-dx * sin + dy * cos) / spacing,
  };
}

describe("computeGrid", () => {
  it("throws for fewer than 3 polygon points", () => {
    expect(() => computeGrid([{ x: 0, y: 0 }, { x: 1, y: 1 }], 4)).toThrow(/at least 3/);
  });

  it("throws when no holes are requested", () => {
    expect(() => computeGrid(square, 0)).toThrow(/at least one hole/);
  });

  it("returns exactly `count` distinct points, all inside the polygon", () => {
    const { centers } = computeGrid(square, 9);
    expect(centers).toHaveLength(9);
    for (const p of centers) {
      expect(pointInPolygon(p.x, p.y, square)).toBe(true);
    }
    // No two holes share a location.
    const keys = new Set(centers.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`));
    expect(keys.size).toBe(9);
  });

  it("keeps the grid axes perpendicular and the angle within one quadrant", () => {
    const { arrangement } = computeGrid(square, 12);
    expect(arrangement.angle).toBeGreaterThanOrEqual(0);
    expect(arrangement.angle).toBeLessThan(Math.PI / 2);
    expect(arrangement.spacing).toBeGreaterThan(0);
  });

  it("places every hole on the fitted lattice (integer lattice coordinates)", () => {
    const { centers, arrangement } = computeGrid(square, 16);
    for (const p of centers) {
      const { a, b } = latticeCoords(p, arrangement.origin, arrangement.spacing, arrangement.angle);
      expect(Math.abs(a - Math.round(a))).toBeLessThan(1e-6);
      expect(Math.abs(b - Math.round(b))).toBeLessThan(1e-6);
    }
  });

  it("uses a spacing close to sqrt(area / count) for a filled square", () => {
    const count = 25;
    const { arrangement } = computeGrid(square, count);
    const expected = Math.sqrt((100 * 100) / count); // 20
    // The natural spacing should be within a sensible band of the ideal.
    expect(arrangement.spacing).toBeGreaterThan(expected * 0.6);
    expect(arrangement.spacing).toBeLessThan(expected * 1.6);
  });

  it("fits an exact count on a concave (L-shaped) contour", () => {
    const { centers } = computeGrid(lShape, 10);
    expect(centers).toHaveLength(10);
    for (const p of centers) {
      expect(pointInPolygon(p.x, p.y, lShape)).toBe(true);
    }
  });

  it("handles a single hole", () => {
    const { centers } = computeGrid(square, 1);
    expect(centers).toHaveLength(1);
    expect(pointInPolygon(centers[0].x, centers[0].y, square)).toBe(true);
  });
});
