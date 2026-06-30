import { describe, it, expect } from "vitest";
import { kMeansCenters, kMeansWithHistory } from "./kmeans";
import type { Point } from "./types";

function grid(n: number): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      pts.push({ x: i, y: j });
    }
  }
  return pts;
}

describe("kMeansCenters", () => {
  it("returns an empty array for k <= 0", () => {
    expect(kMeansCenters(grid(5), 0)).toEqual([]);
    expect(kMeansCenters(grid(5), -3)).toEqual([]);
  });

  it("returns copies of the first k points when there are too few candidates", () => {
    const points: Point[] = [
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ];
    const result = kMeansCenters(points, 5);
    expect(result).toEqual(points);
    // Must be new objects — mutating the result must not affect the input.
    result[0].x = 999;
    expect(points[0].x).toBe(1);
  });

  it("returns the points themselves when points.length === k", () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ];
    const result = kMeansCenters(points, 3);
    expect(result).toEqual(points);
    expect(result[0]).not.toBe(points[0]);
  });

  it("returns exactly k centers inside the input bounding box", () => {
    const points = grid(10); // 100 points spanning [0,9] x [0,9]
    const k = 4;
    const centers = kMeansCenters(points, k);
    expect(centers).toHaveLength(k);
    for (const c of centers) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x).toBeLessThanOrEqual(9);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeLessThanOrEqual(9);
      expect(Number.isFinite(c.x)).toBe(true);
      expect(Number.isFinite(c.y)).toBe(true);
    }
  });
});

describe("kMeansWithHistory", () => {
  it("records frames whose last frame equals the final centers", () => {
    const points = grid(10);
    const k = 4;
    const { centers, frames } = kMeansWithHistory(points, k);

    expect(centers).toHaveLength(k);
    expect(frames.length).toBeGreaterThanOrEqual(1);
    // Every frame holds k centroids, all finite.
    for (const frame of frames) {
      expect(frame).toHaveLength(k);
      for (const c of frame) {
        expect(Number.isFinite(c.x)).toBe(true);
        expect(Number.isFinite(c.y)).toBe(true);
      }
    }
    // The last frame is exactly the centers used for placement.
    expect(frames[frames.length - 1]).toEqual(centers);
  });

  it("agrees with kMeansCenters' edge-case handling", () => {
    expect(kMeansWithHistory(grid(5), 0)).toEqual({ centers: [], frames: [] });

    const few: Point[] = [
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ];
    const { centers } = kMeansWithHistory(few, 5);
    expect(centers).toEqual(few);
    centers[0].x = 999;
    expect(few[0].x).toBe(1); // must be copies
  });
});
