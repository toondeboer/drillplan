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
 * (monitoring well). Each type gets a distinct categorical hue rather than a single
 * depth ramp, so which type is which reads at a glance. The palette is colorblind-safe
 * (worst adjacent CVD ΔE ≈ 13.8) and every hue clears 3:1 contrast on the paper map
 * background. The peilbuis keeps the teal + triangle so the monitoring well stays the
 * obvious outlier among the circular borings.
 */
export const DEFAULT_DRILL_TYPES: DrillType[] = [
  { id: "bo05", code: "bo05", color: "#2a6fd0", symbol: "circle" },
  { id: "bo10", code: "bo10", color: "#2e8b3d", symbol: "circle" },
  { id: "bo15", code: "bo15", color: "#b7791d", symbol: "circle" },
  { id: "bo20", code: "bo20", color: "#c0392b", symbol: "circle" },
  { id: "bo30", code: "bo30", color: "#7b3ff2", symbol: "circle" },
  { id: "pb", code: "pb", color: "#0d9488", symbol: "triangle" },
];

export interface Placement {
  /** Sequential id, e.g. "001". */
  id: string;
  x: number;
  y: number;
  /** Index into the drill-types list. */
  typeIndex: number;
}

/**
 * How the drill positions are generated:
 *   - "kmeans" — evenly spread, organically shaped positions (the default).
 *   - "grid"   — a regular square raster (optionally rotated); every hole sits on a
 *                lattice intersection inside the site, all at one uniform spacing.
 */
export type PlacementMode = "kmeans" | "grid";

export interface ComputeInput {
  /** Site outline vertices (in order). */
  polygon: Point[];
  /** Number of holes per drill type, aligned with the drill-types list. */
  counts: number[];
  /** How to generate positions (default "kmeans"). */
  mode?: PlacementMode;
  /**
   * Grid mode only: fix the raster rotation to this angle (radians) instead of auto-picking
   * the best one. Null/undefined ⇒ search for the best angle.
   */
  angleOverride?: number | null;
  /** Grid resolution used to sample candidate points (default 200). */
  gridResolution?: number;
  /** Number of random assignments to try (default 20000, like the original). */
  iterations?: number;
  /** Whether to run the hill-climb refinement after the random search. */
  refine?: boolean;
  /** Capture the layout's construction so the UI can animate it. */
  captureAnimation?: boolean;
}

/** Data needed to replay the k-means clustering as an animation. */
export interface KMeansAnimation {
  kind: "kmeans";
  /** Interior grid points to display (downsampled from the full candidate set). */
  gridPoints: Point[];
  /** Centroid positions per Lloyd iteration; the last frame are the final centers. */
  frames: Point[][];
}

/** Data needed to draw the fitted raster as an animation. */
export interface GridAnimation {
  kind: "grid";
  /** Rotation of the grid axes, radians. */
  angle: number;
  /** World-unit spacing between adjacent lattice points. */
  spacing: number;
  /** A lattice point (world coords); the lattice is `origin + i·s·u + j·s·v`. */
  origin: Point;
  /** Interior lattice points that become drill holes (the chosen centers). */
  points: Point[];
  /** Lattice points outside the polygon (or trimmed), drawn faded to show the full raster. */
  rejected: Point[];
}

/** The animation payload for whichever placement mode ran. */
export type PlacementAnimation = KMeansAnimation | GridAnimation;

export interface ComputeResult {
  placements: Placement[];
  /** The spread score of the chosen assignment (higher = better spread). */
  score: number;
  /** Number of candidate grid points found inside the polygon. */
  candidateCount: number;
  /** Present only when `captureAnimation` was requested. */
  animation?: PlacementAnimation;
  /** Grid mode only: the fitted raster's rotation (radians) and spacing (world units). */
  grid?: { angle: number; spacing: number };
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
