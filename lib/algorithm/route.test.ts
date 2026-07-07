import { describe, it, expect } from "vitest";
import { optimizeRoute, orderNorthToSouth, northernmostIndex } from "./route";
import type { Placement, RouteOptions } from "./types";

/** Deterministic PRNG (mulberry32) so randomized tests are reproducible. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Build placements from raw coordinates (ids/types are irrelevant to routing). */
function makePlacements(coords: Array<[number, number]>): Placement[] {
  return coords.map(([x, y], i) => ({ id: `orig-${i}`, x, y, typeIndex: 0 }));
}

function randomPlacements(rng: () => number, n: number): Placement[] {
  const coords: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) coords.push([rng() * 1000, rng() * 1000]);
  return makePlacements(coords);
}

const roundTrip: RouteOptions = {
  startIndex: null,
  endIndex: null,
  roundTrip: true,
  numbering: "route",
};

describe("northernmostIndex", () => {
  it("returns the index of the largest-y placement", () => {
    const pts = makePlacements([
      [0, 0],
      [5, 9],
      [3, 2],
    ]);
    expect(northernmostIndex(pts)).toBe(1);
  });

  it("returns 0 for an empty array", () => {
    expect(northernmostIndex([])).toBe(0);
  });
});

describe("optimizeRoute — structure", () => {
  it("renumbers holes sequentially '001'.. along the route", () => {
    const pts = randomPlacements(makeRng(7), 6);
    const plan = optimizeRoute(pts, roundTrip);
    expect(plan.placements.map((p) => p.id)).toEqual(["001", "002", "003", "004", "005", "006"]);
  });

  it("visits every hole exactly once (order is a permutation)", () => {
    const pts = randomPlacements(makeRng(11), 9);
    const plan = optimizeRoute(pts, roundTrip);
    expect(plan.order).toHaveLength(9);
    expect([...plan.order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("keeps each hole's coordinates, just reordered", () => {
    const pts = randomPlacements(makeRng(3), 7);
    const plan = optimizeRoute(pts, roundTrip);
    plan.placements.forEach((p, i) => {
      const src = pts[plan.order[i]];
      expect(p.x).toBe(src.x);
      expect(p.y).toBe(src.y);
    });
  });

  it("defaults the start to the north-most hole", () => {
    const pts = randomPlacements(makeRng(99), 8);
    const plan = optimizeRoute(pts, roundTrip);
    expect(plan.order[0]).toBe(northernmostIndex(pts));
  });
});

describe("optimizeRoute — step history", () => {
  it("records a non-increasing length per step, ending at the final length", () => {
    const pts = randomPlacements(makeRng(21), 12);
    const plan = optimizeRoute(pts, roundTrip);
    for (let i = 1; i < plan.lengths.length; i++) {
      expect(plan.lengths[i]).toBeLessThanOrEqual(plan.lengths[i - 1] + 1e-9);
    }
    expect(plan.lengths[plan.lengths.length - 1]).toBeCloseTo(plan.length, 6);
    expect(plan.steps[plan.steps.length - 1]).toEqual(plan.order);
    expect(plan.steps).toHaveLength(plan.lengths.length);
  });

  it("2-opt never worsens the nearest-neighbor draft, and improves on some layouts", () => {
    const rng = makeRng(1234);
    let improvedCount = 0;
    for (let trial = 0; trial < 60; trial++) {
      const pts = randomPlacements(rng, 10);
      const plan = optimizeRoute(pts, roundTrip);
      // steps[0] is the greedy draft; the final length must not exceed it.
      expect(plan.length).toBeLessThanOrEqual(plan.lengths[0] + 1e-9);
      if (plan.length < plan.lengths[0] - 1e-6) improvedCount++;
    }
    // Nearest-neighbor leaves crossings often enough that 2-opt must help somewhere.
    expect(improvedCount).toBeGreaterThan(0);
  });
});

describe("optimizeRoute — endpoints", () => {
  const pts = randomPlacements(makeRng(55), 10);

  it("honors a fixed start on a round trip", () => {
    const plan = optimizeRoute(pts, {
      startIndex: 4,
      endIndex: null,
      roundTrip: true,
      numbering: "route",
    });
    expect(plan.order[0]).toBe(4);
    expect(plan.roundTrip).toBe(true);
  });

  it("honors a fixed start and end on an open path", () => {
    const plan = optimizeRoute(pts, {
      startIndex: 2,
      endIndex: 7,
      roundTrip: false,
      numbering: "route",
    });
    expect(plan.order[0]).toBe(2);
    expect(plan.order[plan.order.length - 1]).toBe(7);
  });

  it("fixes the start but lets the end float when no end is given", () => {
    const plan = optimizeRoute(pts, {
      startIndex: 3,
      endIndex: null,
      roundTrip: false,
      numbering: "route",
    });
    expect(plan.order[0]).toBe(3);
    expect(plan.roundTrip).toBe(false);
  });

  it("ignores the end index on a round trip", () => {
    const plan = optimizeRoute(pts, {
      startIndex: 1,
      endIndex: 9,
      roundTrip: true,
      numbering: "route",
    });
    expect(plan.order[0]).toBe(1);
    // On a loop the end is the start, not the requested end index.
    expect(plan.order).toContain(9);
  });
});

describe("optimizeRoute — determinism & edge cases", () => {
  it("is deterministic: identical input yields identical output", () => {
    const pts = randomPlacements(makeRng(88), 11);
    const a = optimizeRoute(pts, roundTrip);
    const b = optimizeRoute(pts, roundTrip);
    expect(a.order).toEqual(b.order);
    expect(a.length).toBe(b.length);
  });

  it("handles an empty set", () => {
    const plan = optimizeRoute([], roundTrip);
    expect(plan.placements).toEqual([]);
    expect(plan.order).toEqual([]);
    expect(plan.length).toBe(0);
  });

  it("handles a single hole", () => {
    const pts = makePlacements([[5, 5]]);
    const plan = optimizeRoute(pts, roundTrip);
    expect(plan.placements).toHaveLength(1);
    expect(plan.placements[0].id).toBe("001");
    expect(plan.length).toBe(0);
  });

  it("orders four square corners into the length-4 perimeter loop", () => {
    // Optimal round trip over the unit square is its perimeter (length 4), not a bowtie.
    const pts = makePlacements([
      [0, 0],
      [1, 1],
      [1, 0],
      [0, 1],
    ]);
    const plan = optimizeRoute(pts, roundTrip);
    expect(plan.length).toBeCloseTo(4, 6);
  });
});

describe("orderNorthToSouth", () => {
  it("numbers holes strictly north→south (descending y), west→east on ties", () => {
    // Input deliberately out of order; expect visiting order top-to-bottom.
    const pts = makePlacements([
      [5, 1], // south
      [2, 9], // north, west of the other y=9
      [8, 9], // north, east
      [4, 5], // middle
    ]);
    const plan = orderNorthToSouth(pts);
    expect(plan.order).toEqual([1, 2, 3, 0]);
    expect(plan.placements.map((p) => p.id)).toEqual(["001", "002", "003", "004"]);
    expect(plan.roundTrip).toBe(false);
  });

  it("reports the open-path walking length and a single step (no untangle)", () => {
    const pts = makePlacements([
      [0, 0],
      [0, 10],
      [0, 4],
    ]);
    const plan = orderNorthToSouth(pts);
    // Order is y=10 → y=4 → y=0: distances 6 + 4 = 10.
    expect(plan.length).toBeCloseTo(10, 6);
    expect(plan.steps).toHaveLength(1);
    expect(plan.lengths).toEqual([plan.length]);
  });

  it("handles empty and single-hole inputs", () => {
    expect(orderNorthToSouth([]).order).toEqual([]);
    const one = orderNorthToSouth(makePlacements([[3, 3]]));
    expect(one.placements[0].id).toBe("001");
    expect(one.length).toBe(0);
  });
});
