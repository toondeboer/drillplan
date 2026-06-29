import { describe, it, expect } from "vitest";
import { pointInPolygon, getBounds, sampleInteriorGrid } from "./geometry";
import type { Point } from "./types";

const square: Point[] = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];

const triangle: Point[] = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 5, y: 10 },
];

// L-shaped (concave) polygon occupying the lower and left arms of a 10x10 box.
// The top-right quadrant (x>5, y>5) is the "notch" that is OUTSIDE the polygon.
const lShape: Point[] = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 5 },
  { x: 5, y: 5 },
  { x: 5, y: 10 },
  { x: 0, y: 10 },
];

describe("pointInPolygon", () => {
  it("returns true for a point clearly inside a square", () => {
    expect(pointInPolygon(5, 5, square)).toBe(true);
  });

  it("returns false for points clearly outside a square", () => {
    expect(pointInPolygon(-1, 5, square)).toBe(false);
    expect(pointInPolygon(11, 5, square)).toBe(false);
    expect(pointInPolygon(5, 20, square)).toBe(false);
  });

  it("handles a triangle interior and exterior", () => {
    expect(pointInPolygon(5, 2, triangle)).toBe(true);
    // Above the slanted sides but within the bounding box.
    expect(pointInPolygon(1, 9, triangle)).toBe(false);
    expect(pointInPolygon(9, 9, triangle)).toBe(false);
  });

  it("respects concavity: notch is outside, arms are inside", () => {
    // Point in the notch (top-right quadrant) is outside the L.
    expect(pointInPolygon(7.5, 7.5, lShape)).toBe(false);
    // Points in the two arms are inside.
    expect(pointInPolygon(7.5, 2.5, lShape)).toBe(true); // bottom arm
    expect(pointInPolygon(2.5, 7.5, lShape)).toBe(true); // left arm
  });
});

describe("getBounds", () => {
  it("computes the bounding box of a square", () => {
    expect(getBounds(square)).toEqual({ minX: 0, maxX: 10, minY: 0, maxY: 10 });
  });

  it("handles negative coordinates", () => {
    const poly: Point[] = [
      { x: -5, y: -3 },
      { x: 4, y: -3 },
      { x: 4, y: 6 },
      { x: -5, y: 6 },
    ];
    expect(getBounds(poly)).toEqual({ minX: -5, maxX: 4, minY: -3, maxY: 6 });
  });

  it("handles a single degenerate vertex (min == max)", () => {
    expect(getBounds([{ x: 2, y: 3 }])).toEqual({
      minX: 2,
      maxX: 2,
      minY: 3,
      maxY: 3,
    });
  });
});

describe("sampleInteriorGrid", () => {
  it("returns only points inside the polygon and within bounds", () => {
    const pts = sampleInteriorGrid(square, 20);
    expect(pts.length).toBeGreaterThan(0);
    for (const p of pts) {
      expect(pointInPolygon(p.x, p.y, square)).toBe(true);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(10);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(10);
    }
  });

  it("excludes the concave notch", () => {
    const pts = sampleInteriorGrid(lShape, 40);
    expect(pts.length).toBeGreaterThan(0);
    // No sampled point should fall strictly inside the notch quadrant.
    for (const p of pts) {
      const inNotch = p.x > 5 && p.y > 5;
      expect(inNotch).toBe(false);
    }
  });

  it("invokes onProgress and finishes with exactly 1", () => {
    const fractions: number[] = [];
    sampleInteriorGrid(square, 20, (f) => fractions.push(f));
    expect(fractions.length).toBeGreaterThan(0);
    expect(fractions[fractions.length - 1]).toBe(1);
    for (const f of fractions) {
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
    }
  });

  it("scales the number of interior points with resolution", () => {
    const coarse = sampleInteriorGrid(square, 10);
    const fine = sampleInteriorGrid(square, 40);
    expect(fine.length).toBeGreaterThan(coarse.length);
  });
});
