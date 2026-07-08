import { getBounds, pointInPolygon, sampleInteriorGrid, type Bounds } from "./geometry";
import type { Point } from "./types";

/**
 * A square raster (regular grid) fitted to the site. The two axes are always
 * perpendicular; the whole lattice may be rotated by `angle`. Every drill hole sits on
 * a lattice intersection that falls inside the polygon.
 */
export interface GridArrangement {
  /** Rotation of the grid axes, radians (0 ⇒ axis-aligned). Square symmetry ⇒ [0, π/2). */
  angle: number;
  /** World-unit distance between adjacent lattice points (identical along both axes). */
  spacing: number;
  /** A lattice point in world coords; the lattice is `origin + i·s·u + j·s·v`. */
  origin: Point;
}

export interface GridResult {
  /** The chosen drill positions — exactly `count` interior lattice points. */
  centers: Point[];
  arrangement: GridArrangement;
  /** Lattice points in the bounding box but OUTSIDE the polygon (for the raster preview). */
  rejected: Point[];
  /** Interior lattice points dropped to reach exactly `count` (only when an exact fit was
   *  impossible); shown faded alongside `rejected`. Empty on an exact fit. */
  trimmed: Point[];
}

export interface GridOptions {
  /**
   * Fix the grid rotation to this angle (radians) instead of searching for the best one.
   * Null/undefined ⇒ search all angles. A square lattice repeats every 90°, so the value is
   * wrapped into [0, π/2).
   */
  angle?: number | null;
  /**
   * Minimum distance every hole must keep from the site boundary, as a fraction of the grid
   * spacing (default 0.3). Keeps holes off the outline/fence rather than sitting on the edge.
   */
  marginFactor?: number;
  /** Angles tried across [0, 90°). More ⇒ better rotation fit, slower. Default 30 (3° step). */
  angleSteps?: number;
  /** Phase offsets tried per axis within one cell. Default 4 (a 4×4 grid of offsets). */
  offsetSteps?: number;
  /** Interior sample count target for the coverage objective. Default ~400. */
  coverageSamples?: number;
  onProgress?: (fraction: number) => void;
}

/** Default boundary keep-out, as a fraction of the grid spacing. */
const DEFAULT_MARGIN_FACTOR = 0.3;

/** Signed-area centroid of a polygon; falls back to the bbox center when degenerate. */
function polygonCentroid(polygon: Point[], bounds: Bounds): Point {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const cross = polygon[j].x * polygon[i].y - polygon[i].x * polygon[j].y;
    a += cross;
    cx += (polygon[j].x + polygon[i].x) * cross;
    cy += (polygon[j].y + polygon[i].y) * cross;
  }
  a /= 2;
  if (Math.abs(a) < 1e-9) {
    return { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

/** |signed area| of a polygon. */
function polygonArea(polygon: Point[]): number {
  let a = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    a += (polygon[j].x + polygon[i].x) * (polygon[j].y - polygon[i].y);
  }
  return Math.abs(a) / 2;
}

/**
 * Guardrail on lattice-index span per axis. A well-fitted grid needs ~sqrt(count) cells
 * across, so this is only ever hit by a pathologically thin/tiny polygon at a runaway
 * (too-dense) spacing — there we clamp the range so the interior scan stays bounded and the
 * arrangement simply fails to fit, surfacing the clean "too small or too thin" error rather
 * than churning through millions of points.
 */
const MAX_LATTICE_SPAN = 600;

/** Integer lattice-index range whose points cover the polygon's bounding box (clamped). */
function latticeRange(
  bounds: Bounds,
  s: number,
  cos: number,
  sin: number,
  ox: number,
  oy: number,
) {
  let iMin = Infinity;
  let iMax = -Infinity;
  let jMin = Infinity;
  let jMax = -Infinity;
  const corners = [
    [bounds.minX, bounds.minY],
    [bounds.maxX, bounds.minY],
    [bounds.maxX, bounds.maxY],
    [bounds.minX, bounds.maxY],
  ];
  for (const [x, y] of corners) {
    const dx = x - ox;
    const dy = y - oy;
    // Project onto the (perpendicular) lattice axes u=(cos,sin), v=(-sin,cos).
    const a = (dx * cos + dy * sin) / s;
    const b = (-dx * sin + dy * cos) / s;
    if (a < iMin) iMin = a;
    if (a > iMax) iMax = a;
    if (b < jMin) jMin = b;
    if (b > jMax) jMax = b;
  }
  return {
    iMin: Math.floor(iMin),
    iMax: Math.min(Math.ceil(iMax), Math.floor(iMin) + MAX_LATTICE_SPAN),
    jMin: Math.floor(jMin),
    jMax: Math.min(Math.ceil(jMax), Math.floor(jMin) + MAX_LATTICE_SPAN),
  };
}

/**
 * Whether a lattice point counts as a usable hole: inside the polygon AND at least
 * `margin` away from the boundary, so holes never sit on (or hug) the site edge.
 */
function usable(x: number, y: number, polygon: Point[], margin: number): boolean {
  if (!pointInPolygon(x, y, polygon)) return false;
  return margin <= 0 || distToBoundary({ x, y }, polygon) >= margin;
}

/** How many lattice intersections are usable holes for one arrangement. */
function countInside(
  polygon: Point[],
  bounds: Bounds,
  s: number,
  cos: number,
  sin: number,
  ox: number,
  oy: number,
  marginFactor: number,
): number {
  const { iMin, iMax, jMin, jMax } = latticeRange(bounds, s, cos, sin, ox, oy);
  const margin = marginFactor * s;
  let count = 0;
  for (let i = iMin; i <= iMax; i++) {
    const ux = i * s * cos;
    const uy = i * s * sin;
    for (let j = jMin; j <= jMax; j++) {
      const x = ox + ux - j * s * sin;
      const y = oy + uy + j * s * cos;
      if (usable(x, y, polygon, margin)) count++;
    }
  }
  return count;
}

/**
 * All lattice intersections for one arrangement, split into usable holes ("inside", ≥ margin
 * from the boundary) and everything else ("outside": beyond the polygon or within the margin).
 */
function collectPoints(
  polygon: Point[],
  bounds: Bounds,
  s: number,
  cos: number,
  sin: number,
  ox: number,
  oy: number,
  marginFactor: number,
): { inside: Point[]; outside: Point[] } {
  const { iMin, iMax, jMin, jMax } = latticeRange(bounds, s, cos, sin, ox, oy);
  const margin = marginFactor * s;
  const inside: Point[] = [];
  const outside: Point[] = [];
  for (let i = iMin; i <= iMax; i++) {
    const ux = i * s * cos;
    const uy = i * s * sin;
    for (let j = jMin; j <= jMax; j++) {
      const x = ox + ux - j * s * sin;
      const y = oy + uy + j * s * cos;
      (usable(x, y, polygon, margin) ? inside : outside).push({ x, y });
    }
  }
  return { inside, outside };
}

/**
 * Mean distance from each interior sample to its nearest drill point. Lower ⇒ the points
 * blanket the site more evenly (no under-served pockets), which is exactly the "best
 * division" we want — it rewards a natural spacing and a rotation/offset that fills the
 * whole contour, and penalizes arrangements that bunch the points into one region.
 */
function coverageCost(samples: Point[], points: Point[]): number {
  if (points.length === 0 || samples.length === 0) return Infinity;
  let total = 0;
  for (const s of samples) {
    let best = Infinity;
    for (const p of points) {
      const dx = s.x - p.x;
      const dy = s.y - p.y;
      const d = dx * dx + dy * dy;
      if (d < best) best = d;
    }
    total += Math.sqrt(best);
  }
  return total / samples.length;
}

/** Shortest distance from a point to the polygon's boundary (used to trim fringe points). */
function distToBoundary(p: Point, polygon: Point[]): number {
  let best = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const ax = polygon[j].x;
    const ay = polygon[j].y;
    const bx = polygon[i].x;
    const by = polygon[i].y;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((p.x - ax) * dx + (p.y - ay) * dy) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    const d = Math.hypot(p.x - cx, p.y - cy);
    if (d < best) best = d;
  }
  return best;
}

/**
 * For a fixed angle + offset, find the largest spacing whose lattice puts exactly `count`
 * points inside the polygon (grid density is monotonic — bigger spacing ⇒ fewer points).
 * Returns `{ spacing, count }`: `count === target` on an exact fit, otherwise the closest
 * count from above (≥ target, for trimming) reached at the transition spacing.
 */
function fitSpacing(
  polygon: Point[],
  bounds: Bounds,
  target: number,
  cos: number,
  sin: number,
  ox: number,
  oy: number,
  s0: number,
  marginFactor: number,
): { spacing: number; count: number } {
  const count = (s: number) => countInside(polygon, bounds, s, cos, sin, ox, oy, marginFactor);
  let lo = s0; // want count(lo) >= target
  let hi = s0; // want count(hi)  <  target
  // Expand lo downward (denser) until it holds enough points.
  let guard = 0;
  while (count(lo) < target && guard++ < 40) {
    lo *= 0.75;
  }
  // Expand hi upward (coarser) until it holds too few.
  guard = 0;
  while (count(hi) >= target && guard++ < 40) {
    hi *= 1.4;
  }
  // Bisect toward the density transition; `lo` stays the coarsest spacing with count ≥ target.
  for (let it = 0; it < 34; it++) {
    const mid = (lo + hi) / 2;
    if (count(mid) >= target) lo = mid;
    else hi = mid;
  }
  return { spacing: lo, count: count(lo) };
}

/**
 * Fit a square raster to `polygon` holding exactly `count` interior lattice points, and
 * choose the rotation, offset and spacing that spread those points most evenly across the
 * site (minimum coverage cost). Every returned center is a grid intersection, so all holes
 * share one regular spacing — the grid alternative to k-means placement.
 */
export function computeGrid(
  polygon: Point[],
  count: number,
  options: GridOptions = {},
): GridResult {
  if (polygon.length < 3) throw new Error("The area needs at least 3 points.");
  if (count < 1) throw new Error("Choose at least one hole to place.");

  const bounds = getBounds(polygon);
  const area = polygonArea(polygon);
  if (area <= 0) throw new Error("The area has no surface to place holes in.");

  const pc = polygonCentroid(polygon, bounds);
  const s0 = Math.sqrt(area / count); // spacing at which ~count points fit
  const offsetSteps = options.offsetSteps ?? 4;
  const marginFactor = options.marginFactor ?? DEFAULT_MARGIN_FACTOR;

  // Which rotations to try: a single user-fixed angle, or a sweep across the quadrant.
  const angles: number[] = [];
  if (options.angle != null) {
    let a = options.angle % (Math.PI / 2);
    if (a < 0) a += Math.PI / 2; // square lattice repeats every 90°
    angles.push(a);
  } else {
    const angleSteps = options.angleSteps ?? 30;
    for (let ai = 0; ai < angleSteps; ai++) angles.push((Math.PI / 2) * (ai / angleSteps));
  }

  // Coverage reference samples (coarse interior grid, capped for speed).
  const targetSamples = options.coverageSamples ?? 400;
  const sampleRes = Math.max(12, Math.min(60, Math.round(Math.sqrt(targetSamples)) || 20));
  const samples = sampleInteriorGrid(polygon, sampleRes);
  const coverageRef = samples.length ? samples : [pc];

  let bestCost = Infinity;
  let best: { angle: number; spacing: number; ox: number; oy: number } | null = null;
  // Fallback when no exact fit exists at any angle/offset: the arrangement with the fewest
  // extra points (≥ count), best coverage, to be trimmed down.
  let overCost = Infinity;
  let over: { angle: number; spacing: number; ox: number; oy: number; count: number } | null =
    null;

  for (let ai = 0; ai < angles.length; ai++) {
    const angle = angles[ai];
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (let oi = 0; oi < offsetSteps; oi++) {
      for (let oj = 0; oj < offsetSteps; oj++) {
        const fu = oi / offsetSteps;
        const fv = oj / offsetSteps;
        // Shift the lattice origin by a fraction of a cell along each axis.
        const ox = pc.x + (fu * cos - fv * sin) * s0;
        const oy = pc.y + (fu * sin + fv * cos) * s0;
        const fit = fitSpacing(polygon, bounds, count, cos, sin, ox, oy, s0, marginFactor);
        const { inside } = collectPoints(polygon, bounds, fit.spacing, cos, sin, ox, oy, marginFactor);
        const cost = coverageCost(coverageRef, inside);
        if (fit.count === count) {
          if (cost < bestCost) {
            bestCost = cost;
            best = { angle, spacing: fit.spacing, ox, oy };
          }
        } else if (fit.count > count && cost < overCost) {
          overCost = cost;
          over = { angle, spacing: fit.spacing, ox, oy, count: fit.count };
        }
      }
    }
    options.onProgress?.((ai + 1) / angles.length);
  }

  const chosen = best ?? over;
  if (!chosen) {
    throw new Error(
      `The area is too small or too thin for ${count} holes on a grid. Try a larger area or fewer holes.`,
    );
  }

  const cos = Math.cos(chosen.angle);
  const sin = Math.sin(chosen.angle);
  const { inside, outside } = collectPoints(
    polygon,
    bounds,
    chosen.spacing,
    cos,
    sin,
    chosen.ox,
    chosen.oy,
    marginFactor,
  );

  let centers = inside;
  const trimmed: Point[] = [];
  if (inside.length > count) {
    // No exact fit: drop the points nearest the boundary (the outermost fringe) so the
    // retained points stay a clean, centered core at the natural spacing.
    const ranked = inside
      .map((p) => ({ p, m: distToBoundary(p, polygon) }))
      .sort((a, b) => b.m - a.m);
    centers = ranked.slice(0, count).map((r) => r.p);
    for (const r of ranked.slice(count)) trimmed.push(r.p);
  }

  return {
    centers,
    arrangement: { angle: chosen.angle, spacing: chosen.spacing, origin: { x: chosen.ox, y: chosen.oy } },
    rejected: outside,
    trimmed,
  };
}
