import { sampleInteriorGrid } from "./geometry";
import { computeGrid } from "./grid";
import { kMeansWithHistory } from "./kmeans";
import { optimize } from "./optimize";
import type {
  ComputeInput,
  ComputeResult,
  ComputePhase,
  PlacementAnimation,
  Placement,
  Point,
} from "./types";

export interface ComputeCallbacks {
  onProgress?: (phase: ComputePhase, fraction: number) => void;
}

/**
 * Resolution of the (separate) coarse interior grid shown during the animation.
 * Kept ≤ 49 so the worst case — a polygon that fills its whole bounding box —
 * still yields at most 50×50 = 2500 dots, cheap to redraw every frame. This is a
 * clean rectangular lattice (unlike thinning the dense compute grid, which aliases
 * into diagonal moiré bands because interior columns have unequal heights).
 */
const ANIMATION_GRID_RESOLUTION = 48;

/**
 * Full pipeline, mirroring the legacy `run`:
 *   1. sample interior grid points
 *   2. K-Means to get evenly spread candidate centers (k = total holes)
 *   3. optimize the type assignment to maximize same-type spread
 * Returns the placements grouped by type and numbered "001", "002", ...
 */
export function compute(input: ComputeInput, callbacks: ComputeCallbacks = {}): ComputeResult {
  const { polygon, counts } = input;
  const mode = input.mode ?? "kmeans";
  const resolution = input.gridResolution ?? 200;
  const iterations = input.iterations ?? 20000;
  const refine = input.refine ?? true;
  const total = counts.reduce((a, b) => a + b, 0);

  if (polygon.length < 3) throw new Error("The area needs at least 3 points.");
  if (total < 1) throw new Error("Choose at least one hole to place.");

  // Stage 1 — generate `total` evenly distributed candidate centers, either by clustering
  // an interior sample (k-means) or by fitting a regular raster to the site (grid).
  let centers: Point[];
  let candidateCount: number;
  let animation: PlacementAnimation | undefined;
  let gridInfo: ComputeResult["grid"];

  if (mode === "grid") {
    const grid = computeGrid(polygon, total, {
      angle: input.angleOverride ?? null,
      onProgress: (f) => callbacks.onProgress?.("grid", f),
    });
    centers = grid.centers;
    candidateCount = grid.centers.length + grid.trimmed.length;
    gridInfo = { angle: grid.arrangement.angle, spacing: grid.arrangement.spacing };
    animation = input.captureAnimation
      ? {
          kind: "grid",
          angle: grid.arrangement.angle,
          spacing: grid.arrangement.spacing,
          origin: grid.arrangement.origin,
          points: grid.centers,
          rejected: [...grid.rejected, ...grid.trimmed],
        }
      : undefined;
  } else {
    const candidates = sampleInteriorGrid(polygon, resolution, (f) =>
      callbacks.onProgress?.("grid", f),
    );
    if (candidates.length < total) {
      throw new Error(
        `The area is too small or too thin for ${total} holes (only ${candidates.length} candidate points found). Try a larger area or fewer holes.`,
      );
    }
    callbacks.onProgress?.("kmeans", 0);
    const km = kMeansWithHistory(candidates, total);
    callbacks.onProgress?.("kmeans", 1);
    centers = km.centers;
    candidateCount = candidates.length;
    animation = input.captureAnimation
      ? {
          kind: "kmeans",
          gridPoints: sampleInteriorGrid(polygon, ANIMATION_GRID_RESOLUTION),
          frames: km.frames,
        }
      : undefined;
  }

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

  return { placements, score, candidateCount, animation, grid: gridInfo };
}
