import { sampleInteriorGrid } from "./geometry";
import { kMeansCenters } from "./kmeans";
import { optimize } from "./optimize";
import type { ComputeInput, ComputeResult, ComputePhase, Placement } from "./types";

export interface ComputeCallbacks {
  onProgress?: (phase: ComputePhase, fraction: number) => void;
}

/**
 * Full pipeline, mirroring the legacy `run`:
 *   1. sample interior grid points
 *   2. K-Means to get evenly spread candidate centers (k = total holes)
 *   3. optimize the type assignment to maximize same-type spread
 * Returns the placements grouped by type and numbered "001", "002", ...
 */
export function compute(input: ComputeInput, callbacks: ComputeCallbacks = {}): ComputeResult {
  const { polygon, counts } = input;
  const resolution = input.gridResolution ?? 200;
  const iterations = input.iterations ?? 20000;
  const refine = input.refine ?? true;
  const total = counts.reduce((a, b) => a + b, 0);

  if (polygon.length < 3) throw new Error("The area needs at least 3 points.");
  if (total < 1) throw new Error("Choose at least one hole to place.");

  const candidates = sampleInteriorGrid(polygon, resolution, (f) =>
    callbacks.onProgress?.("grid", f),
  );
  if (candidates.length < total) {
    throw new Error(
      `The area is too small or too thin for ${total} holes (only ${candidates.length} candidate points found). Try a larger area or fewer holes.`,
    );
  }

  callbacks.onProgress?.("kmeans", 0);
  const centers = kMeansCenters(candidates, total);
  callbacks.onProgress?.("kmeans", 1);

  const { assignment, score } = optimize(centers, counts, {
    iterations,
    refine,
    onProgress: (f) => callbacks.onProgress?.("optimize", f),
  });

  // Group by type (BOR05, BOR10, BOR20, PB) and number sequentially — same
  // ordering the legacy script produced in its result CSV.
  const placements: Placement[] = [];
  let n = 1;
  for (let t = 0; t < counts.length; t++) {
    for (let c = 0; c < centers.length; c++) {
      if (assignment[c] === t) {
        placements.push({
          id: String(n).padStart(3, "0"),
          x: centers[c].x,
          y: centers[c].y,
          typeIndex: t,
        });
        n++;
      }
    }
  }

  return { placements, score, candidateCount: candidates.length };
}
