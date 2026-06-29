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
}

export interface ComputeResult {
  placements: Placement[];
  /** The spread score of the chosen assignment (higher = better spread). */
  score: number;
  /** Number of candidate grid points found inside the polygon. */
  candidateCount: number;
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
