export interface Point {
  x: number;
  y: number;
}

/** The marker shapes a drill type can be drawn with. */
export type DrillSymbol = "circle" | "square" | "triangle" | "diamond";
export const DRILL_SYMBOLS: DrillSymbol[] = ["circle", "square", "triangle", "diamond"];

/** A user-customizable kind of drill (name, color, marker shape). */
export interface DrillType {
  /** Stable id — React keys, survives rename/reorder. */
  id: string;
  /** Editable short name shown as the chip, e.g. "bo05". */
  code: string;
  /** Hex fill color. */
  color: string;
  /** Marker shape. */
  symbol: DrillSymbol;
}

/**
 * The default drill types: five borings to 0.5/1.0/1.5/2.0/3.0 m plus a peilbuis
 * (monitoring well). Colors use the cartographic geological ramp — depth darkens
 * (sand/ochre → sienna → rust/umber) — and the peilbuis is the cool slate-teal outlier,
 * drawn as a triangle so it stands out from the circular borings.
 */
export const DEFAULT_DRILL_TYPES: DrillType[] = [
  { id: "bo05", code: "bo05", color: "#d2a24c", symbol: "circle" },
  { id: "bo10", code: "bo10", color: "#c58a3d", symbol: "circle" },
  { id: "bo15", code: "bo15", color: "#bf7233", symbol: "circle" },
  { id: "bo20", code: "bo20", color: "#a85628", symbol: "circle" },
  { id: "bo30", code: "bo30", color: "#8f3f1f", symbol: "circle" },
  { id: "pb", code: "pb", color: "#2f6b73", symbol: "triangle" },
];

export interface Placement {
  /** Sequential id, e.g. "001". */
  id: string;
  x: number;
  y: number;
  /** Index into the drill-types list. */
  typeIndex: number;
}

export interface ComputeInput {
  /** Site outline vertices (in order). */
  polygon: Point[];
  /** Number of holes per drill type, aligned with the drill-types list. */
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
  /** When true, the route returns to the start (a closed loop). Ignored for "northSouth". */
  roundTrip: boolean;
  /** "route" = shortest walking route (TSP); "northSouth" = number strictly north→south. */
  numbering: "route" | "northSouth";
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
