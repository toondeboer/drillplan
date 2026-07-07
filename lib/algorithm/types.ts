export interface Point {
  x: number;
  y: number;
}

/**
 * The four measurement types, in the same order the legacy script used
 * (`['BOR05', 'BOR10', 'BOR20', 'PB']`). Colors use the cartographic
 * geological ramp: depth darkens (sand/ochre → sienna → rust/umber) and the
 * monitoring well is the cool slate-teal outlier.
 */
export const MEASUREMENT_TYPES = [
  { code: "BOR05", color: "#d2a24c" },
  { code: "BOR10", color: "#bf7233" },
  { code: "BOR20", color: "#8f3f1f" },
  { code: "PB", color: "#2f6b73" },
] as const;

export type MeasurementCode = (typeof MEASUREMENT_TYPES)[number]["code"];

export interface Placement {
  /** Sequential id, e.g. "001". */
  id: string;
  x: number;
  y: number;
  /** Index into MEASUREMENT_TYPES. */
  typeIndex: number;
}

export interface ComputeInput {
  /** Site outline vertices (in order). */
  polygon: Point[];
  /** Number of holes per measurement type, aligned with MEASUREMENT_TYPES. */
  counts: number[];
  /** Grid resolution used to sample candidate points (default 200). */
  gridResolution?: number;
  /** Number of random assignments to try (default 20000, like the original). */
  iterations?: number;
  /** Whether to run the hill-climb refinement after the random search. */
  refine?: boolean;
  /** Capture grid points + per-iteration centroids so the UI can animate k-means. */
  captureAnimation?: boolean;
}

/** Data needed to replay the k-means clustering as an animation. */
export interface KMeansAnimation {
  /** Interior grid points to display (downsampled from the full candidate set). */
  gridPoints: Point[];
  /** Centroid positions per Lloyd iteration; the last frame are the final centers. */
  frames: Point[][];
}

export interface ComputeResult {
  placements: Placement[];
  /** The spread score of the chosen assignment (higher = better spread). */
  score: number;
  /** Number of candidate grid points found inside the polygon. */
  candidateCount: number;
  /** Present only when `captureAnimation` was requested. */
  animation?: KMeansAnimation;
}

/** How to order holes into the drilling route (Traveling Salesman). */
export interface RouteOptions {
  /** Index (into the input placements) of the hole to start at. Null ⇒ north-most. */
  startIndex: number | null;
  /** Index of the hole to end at. Null ⇒ chosen automatically. Ignored on round trips. */
  endIndex: number | null;
  /** When true, the route returns to the start (a closed loop). */
  roundTrip: boolean;
}

/**
 * The result of ordering holes into the shortest drilling route. `placements` are
 * reordered along the route and renumbered "001", "002", … so the CSV is ready to drill
 * top-to-bottom. `steps`/`lengths` capture the algorithm's progress for the animation.
 */
export interface RoutePlan {
  /** Holes in visiting order, renumbered sequentially. */
  placements: Placement[];
  /** order[i] = index of the i-th visited hole in the original input array. */
  order: number[];
  /** Total route length (metres), matching lengths[lengths.length - 1]. */
  length: number;
  /** Whether the route closes back to the start. */
  roundTrip: boolean;
  /**
   * Visiting orders (each an array of original indices) captured as the algorithm ran:
   * steps[0] is the nearest-neighbor draft, one snapshot per accepted 2-opt swap, and the
   * last entry is the final order. Used to animate construction then untangling.
   */
  steps: number[][];
  /** Total route length after each step; non-increasing. */
  lengths: number[];
}

export type ComputePhase = "grid" | "kmeans" | "optimize";

export interface ProgressMessage {
  type: "progress";
  phase: ComputePhase;
  fraction: number;
}

export interface ResultMessage {
  type: "result";
  result: ComputeResult;
}

export interface ErrorMessage {
  type: "error";
  message: string;
}

export type WorkerOutMessage = ProgressMessage | ResultMessage | ErrorMessage;
