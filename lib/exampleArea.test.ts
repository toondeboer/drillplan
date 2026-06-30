import { describe, it, expect } from "vitest";
import { generateExamplePolygon } from "./exampleArea";
import type { Point } from "./algorithm/types";

/** Signed area via the shoelace formula; |area| > 0 means non-degenerate. */
function shoelaceArea(polygon: Point[]): number {
  let sum = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    sum += (polygon[j].x + polygon[i].x) * (polygon[j].y - polygon[i].y);
  }
  return Math.abs(sum) / 2;
}

describe("generateExamplePolygon", () => {
  it("returns 6–12 finite vertices forming a non-degenerate polygon", () => {
    for (let trial = 0; trial < 30; trial++) {
      const polygon = generateExamplePolygon();
      expect(polygon.length).toBeGreaterThanOrEqual(6);
      expect(polygon.length).toBeLessThanOrEqual(12);
      for (const p of polygon) {
        expect(Number.isFinite(p.x)).toBe(true);
        expect(Number.isFinite(p.y)).toBe(true);
      }
      expect(shoelaceArea(polygon)).toBeGreaterThan(0);
    }
  });

  it("produces different shapes on successive calls", () => {
    const a = generateExamplePolygon();
    const b = generateExamplePolygon();
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });
});
