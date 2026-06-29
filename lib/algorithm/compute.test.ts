import { describe, it, expect } from "vitest";
import { compute } from "./compute";
import type { ComputePhase, Point } from "./types";

const square: Point[] = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

describe("compute", () => {
  it("throws when the polygon has fewer than 3 points", () => {
    expect(() =>
      compute({ polygon: [{ x: 0, y: 0 }, { x: 1, y: 1 }], counts: [1, 0, 0, 0] }),
    ).toThrow(/at least 3 points/);
  });

  it("throws when no holes are requested", () => {
    expect(() => compute({ polygon: square, counts: [0, 0, 0, 0] })).toThrow(
      /at least one hole/,
    );
  });

  it("throws when the area yields fewer candidates than holes", () => {
    // resolution 1 -> only bounding-box corners are sampled; far fewer than 5.
    expect(() =>
      compute({ polygon: square, counts: [5, 0, 0, 0], gridResolution: 1 }),
    ).toThrow(/too small or too thin/);
  });

  it("produces grouped, sequentially-numbered placements for the happy path", () => {
    const result = compute({
      polygon: square,
      counts: [2, 1, 1, 0],
      gridResolution: 30,
      iterations: 300,
      refine: false,
    });

    expect(result.candidateCount).toBeGreaterThan(0);
    expect(Number.isFinite(result.score)).toBe(true);
    expect(result.placements).toHaveLength(4);

    // Ids are zero-padded and sequential.
    expect(result.placements.map((p) => p.id)).toEqual(["001", "002", "003", "004"]);

    // Placements are grouped by type in ascending type order (counts [2,1,1,0]).
    expect(result.placements.map((p) => p.typeIndex)).toEqual([0, 0, 1, 2]);

    // Every placement sits inside the site bounding box.
    for (const p of result.placements) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(100);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(100);
    }
  });

  it("reports progress for the grid, kmeans and optimize phases", () => {
    const phases = new Set<ComputePhase>();
    compute(
      {
        polygon: square,
        counts: [1, 1, 0, 0],
        gridResolution: 20,
        iterations: 100,
        refine: false,
      },
      { onProgress: (phase) => phases.add(phase) },
    );
    expect(phases.has("grid")).toBe(true);
    expect(phases.has("kmeans")).toBe(true);
    expect(phases.has("optimize")).toBe(true);
  });
});
