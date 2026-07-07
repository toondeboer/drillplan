"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { getBounds, type Bounds } from "@/lib/algorithm/geometry";
import {
  type DrillSymbol,
  type DrillType,
  type KMeansAnimation,
  type Placement,
  type Point,
  type RoutePlan,
} from "@/lib/algorithm/types";
import { useI18n } from "@/lib/i18n";

const WIDTH = 920;
const HEIGHT = 600;
const PADDING = 54;

/** Light "paper" cartographic theme. */
const THEME = {
  bg: "#fbf8f1",
  grid: "rgba(120,100,70,0.10)",
  frame: "rgba(120,100,70,0.18)",
  label: "#b3a48c",
  line: "#6f5d44",
  fill: "rgba(189,90,46,0.06)",
  ring: "#fbf8f1",
  dot: "rgba(111,93,68,0.45)", // neutral interior-grid dot before clustering
} as const;

// Animation timeline (ms).
const SWEEP_MS = 700; // lay the interior grid over the area
const SEED_MS = 320; // drop the initial k-means++ centroids
const ITER_TARGET_MS = 2600; // total time budget for all Lloyd steps
const STEP_MIN_MS = 90;
const STEP_MAX_MS = 360;
const REVEAL_MS = 650; // fade grid out, color into the final result

// Route (Traveling Salesman) animation, played straight after the k-means reveal.
const ROUTE_MARK_MS = 480; // pulse the start hole before building
const ROUTE_BUILD_TARGET_MS = 1900; // budget for the greedy nearest-neighbor build
const ROUTE_HOP_MIN_MS = 70;
const ROUTE_HOP_MAX_MS = 260;
const ROUTE_OPT_TARGET_MS = 1700; // budget for the 2-opt untangling
const ROUTE_OPT_MIN_MS = 120;
const ROUTE_OPT_MAX_MS = 520;
const ROUTE_SETTLE_MS = 620; // hold the finished route before going static

const CENTROID_R = 7;
const GRID_DOT_R = 1.7;

/** Route path + drill-head + endpoint marker colors (kept in the paper palette). */
const ROUTE = {
  line: "rgba(47,42,30,0.55)",
  head: "#bd5a2e", // clay drill head
  start: "#bd5a2e", // clay start ring
  end: "#2f6b73", // slate-teal end ring
} as const;

export interface SitePlotHandle {
  toPng: () => string | null;
  /** Jump the running k-means animation straight to the final result. */
  skip: () => void;
}

interface SitePlotProps {
  polygon: Point[] | null;
  placements?: Placement[];
  /** The drill-type definitions (color + shape), indexed by `Placement.typeIndex`. */
  drillTypes: DrillType[];
  animation?: KMeansAnimation | null;
  /** "full" plays k-means + route; "route" replays only the route; false stays static. */
  animate?: "full" | "route" | false;
  onAnimationDone?: () => void;
  /** When set, only placements of this measurement-type index are emphasized. */
  highlightType?: number | null;
  /** The drilling route to overlay + animate. `placements` must already be its order. */
  route?: RoutePlan | null;
  /** When set, clicking a hole reports its index via `onPickPoint` (start/end selection). */
  pickMode?: "start" | "end" | null;
  onPickPoint?: (placementIndex: number) => void;
}

interface Projector {
  bounds: Bounds;
  scale: number;
  project: (p: Point) => [number, number];
}

function makeProjector(polygon: Point[] | null): Projector {
  const bounds =
    polygon && polygon.length >= 2
      ? getBounds(polygon)
      : { minX: 0, maxX: 1, minY: 0, maxY: 1 };
  const { minX, maxX, minY, maxY } = bounds;
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const availW = WIDTH - PADDING * 2;
  const availH = HEIGHT - PADDING * 2;
  const scale = Math.min(availW / spanX, availH / spanY);
  const offsetX = PADDING + (availW - spanX * scale) / 2;
  const offsetY = PADDING + (availH - spanY * scale) / 2;
  return {
    bounds,
    scale,
    project: (p: Point) => [
      offsetX + (p.x - minX) * scale,
      offsetY + (maxY - p.y) * scale, // flip Y so north is up
    ],
  };
}

/** "Nice" step (1/2/2.5/5/10 × 10ⁿ) closest to span / target. */
function niceStep(span: number, target: number): number {
  const rough = span / target;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (pow * m >= rough) return pow * m;
  }
  return pow * 10;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Distinct hue per cluster (golden-angle spread); clusters ≠ measurement types. */
function clusterColor(i: number): string {
  return `hsl(${Math.round((i * 137.508) % 360)}, 52%, 52%)`;
}

function nearestIndex(p: Point, centers: Point[]): number {
  let best = 0;
  let bestDist = Infinity;
  for (let c = 0; c < centers.length; c++) {
    const dx = p.x - centers[c].x;
    const dy = p.y - centers[c].y;
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

// ── Layer drawing helpers ─────────────────────────────────────────────────────

function drawBackground(ctx: CanvasRenderingContext2D) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = THEME.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function drawGraticule(
  ctx: CanvasRenderingContext2D,
  projector: Projector,
  monoFamily: string,
) {
  ctx.lineWidth = 1;
  ctx.strokeStyle = THEME.grid;
  const b = projector.bounds;
  const stepX = niceStep(b.maxX - b.minX, 5);
  const stepY = niceStep(b.maxY - b.minY, 5);
  ctx.font = `10px ${monoFamily}`;
  ctx.fillStyle = THEME.label;
  for (let x = Math.ceil(b.minX / stepX) * stepX; x <= b.maxX; x += stepX) {
    const [sx] = projector.project({ x, y: b.maxY });
    ctx.beginPath();
    ctx.moveTo(sx, PADDING);
    ctx.lineTo(sx, HEIGHT - PADDING);
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillText(String(Math.round(x)), sx, HEIGHT - PADDING + 16);
  }
  for (let y = Math.ceil(b.minY / stepY) * stepY; y <= b.maxY; y += stepY) {
    const [, sy] = projector.project({ x: b.minX, y });
    ctx.beginPath();
    ctx.moveTo(PADDING, sy);
    ctx.lineTo(WIDTH - PADDING, sy);
    ctx.stroke();
    ctx.save();
    ctx.translate(PADDING - 8, sy);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText(String(Math.round(y)), 0, 0);
    ctx.restore();
  }
}

function drawPlaceholderGrid(ctx: CanvasRenderingContext2D) {
  ctx.lineWidth = 1;
  ctx.strokeStyle = THEME.grid;
  for (let i = 1; i < 8; i++) {
    const gx = PADDING + ((WIDTH - 2 * PADDING) * i) / 8;
    ctx.beginPath();
    ctx.moveTo(gx, PADDING);
    ctx.lineTo(gx, HEIGHT - PADDING);
    ctx.stroke();
  }
  for (let i = 1; i < 5; i++) {
    const gy = PADDING + ((HEIGHT - 2 * PADDING) * i) / 5;
    ctx.beginPath();
    ctx.moveTo(PADDING, gy);
    ctx.lineTo(WIDTH - PADDING, gy);
    ctx.stroke();
  }
}

function drawFrame(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = THEME.frame;
  ctx.lineWidth = 1;
  ctx.strokeRect(PADDING, PADDING, WIDTH - 2 * PADDING, HEIGHT - 2 * PADDING);
}

function drawPolygon(
  ctx: CanvasRenderingContext2D,
  polygon: Point[],
  projector: Projector,
  alpha = 1,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  polygon.forEach((p, i) => {
    const [sx, sy] = projector.project(p);
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  });
  ctx.closePath();
  ctx.fillStyle = THEME.fill;
  ctx.fill();
  ctx.lineJoin = "round";
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = THEME.line;
  ctx.stroke();
  // Vertices
  polygon.forEach((p) => {
    const [sx, sy] = projector.project(p);
    ctx.beginPath();
    ctx.arc(sx, sy, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = THEME.line;
    ctx.fill();
  });
  ctx.restore();
}

/** Trace the marker path for `symbol`, centered at (x, y) with nominal radius r. */
function traceSymbol(
  ctx: CanvasRenderingContext2D,
  symbol: DrillSymbol,
  x: number,
  y: number,
  r: number,
) {
  ctx.beginPath();
  switch (symbol) {
    case "square": {
      const s = r * 0.9;
      ctx.rect(x - s, y - s, s * 2, s * 2);
      break;
    }
    case "triangle": {
      const h = r * 1.2;
      ctx.moveTo(x, y - h);
      ctx.lineTo(x + h * 0.95, y + h * 0.72);
      ctx.lineTo(x - h * 0.95, y + h * 0.72);
      ctx.closePath();
      break;
    }
    case "diamond": {
      const d = r * 1.18;
      ctx.moveTo(x, y - d);
      ctx.lineTo(x + d, y);
      ctx.lineTo(x, y + d);
      ctx.lineTo(x - d, y);
      ctx.closePath();
      break;
    }
    case "circle":
    default:
      ctx.arc(x, y, r, 0, Math.PI * 2);
      break;
  }
}

function drawPlacements(
  ctx: CanvasRenderingContext2D,
  placements: Placement[],
  drillTypes: DrillType[],
  projector: Projector,
  hovered: number | null,
  alpha = 1,
  highlightType: number | null = null,
) {
  ctx.save();
  ctx.lineJoin = "round";
  placements.forEach((pl, idx) => {
    const [sx, sy] = projector.project(pl);
    const type = drillTypes[pl.typeIndex];
    const color = type?.color ?? "#8a7a5c";
    const symbol = type?.symbol ?? "circle";
    const isHover = hovered === idx;
    const dimmed = highlightType != null && pl.typeIndex !== highlightType;
    const emphasized = highlightType != null && pl.typeIndex === highlightType;
    ctx.globalAlpha = dimmed ? alpha * 0.16 : alpha;
    const r = isHover ? 8 : emphasized ? 7 : 5.5;
    if (isHover) {
      ctx.beginPath();
      ctx.arc(sx, sy, r + 4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(42,36,25,0.14)";
      ctx.fill();
    }
    traceSymbol(ctx, symbol, sx, sy, r);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = THEME.ring;
    ctx.stroke();
  });
  ctx.restore();
}

function drawScaleAndNorth(
  ctx: CanvasRenderingContext2D,
  projector: Projector,
  monoFamily: string,
) {
  // Scale bar (bottom-right)
  const targetPx = (WIDTH - 2 * PADDING) / 5;
  const dist = niceStep(targetPx / projector.scale, 1);
  const lenPx = dist * projector.scale;
  const x2 = WIDTH - PADDING - 12;
  const x1 = x2 - lenPx;
  const yb = HEIGHT - PADDING - 14;
  ctx.strokeStyle = THEME.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x1, yb);
  ctx.lineTo(x2, yb);
  ctx.moveTo(x1, yb - 4);
  ctx.lineTo(x1, yb + 4);
  ctx.moveTo(x2, yb - 4);
  ctx.lineTo(x2, yb + 4);
  ctx.stroke();
  ctx.fillStyle = THEME.label;
  ctx.font = `10px ${monoFamily}`;
  ctx.textAlign = "center";
  ctx.fillText(`${dist} m`, (x1 + x2) / 2, yb - 7);

  // North arrow (top-right)
  const nx = WIDTH - PADDING - 20;
  const ny = PADDING + 12;
  ctx.fillStyle = THEME.line;
  ctx.beginPath();
  ctx.moveTo(nx, ny);
  ctx.lineTo(nx - 5, ny + 13);
  ctx.lineTo(nx + 5, ny + 13);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = THEME.label;
  ctx.font = `bold 10px ${monoFamily}`;
  ctx.textAlign = "center";
  ctx.fillText("N", nx, ny - 4);
}

/** The full, non-animated render (the original `draw`). */
function drawStatic(
  ctx: CanvasRenderingContext2D,
  polygon: Point[] | null,
  placements: Placement[],
  drillTypes: DrillType[],
  projector: Projector,
  hovered: number | null,
  monoFamily: string,
  highlightType: number | null = null,
  route: RoutePlan | null = null,
) {
  const hasPoly = !!polygon && polygon.length >= 2;
  drawBackground(ctx);
  if (hasPoly) drawGraticule(ctx, projector, monoFamily);
  else drawPlaceholderGrid(ctx);
  drawFrame(ctx);
  if (!hasPoly || !polygon) return;
  drawPolygon(ctx, polygon, projector);
  // The route sits under the holes so the type colors stay crisp; skip it while a single
  // type is highlighted to keep that view uncluttered.
  if (route && highlightType == null && placements.length >= 2) {
    drawRoute(ctx, placements, projector, {
      roundTrip: route.roundTrip,
      monoFamily,
      showNumbers: true,
      startEnd: true,
    });
    drawRouteLength(ctx, route.length, monoFamily);
  }
  drawPlacements(ctx, placements, drillTypes, projector, hovered, 1, highlightType);
  drawScaleAndNorth(ctx, projector, monoFamily);
}

function drawGridDots(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  projector: Projector,
  colorFor: (p: Point) => string,
  alpha: number,
  revealX: number | null,
) {
  if (alpha <= 0) return;
  const b = projector.bounds;
  const spanX = b.maxX - b.minX || 1;
  ctx.save();
  ctx.globalAlpha = alpha;
  for (const p of points) {
    if (revealX != null && (p.x - b.minX) / spanX > revealX) continue;
    const [sx, sy] = projector.project(p);
    ctx.fillStyle = colorFor(p);
    ctx.beginPath();
    ctx.arc(sx, sy, GRID_DOT_R, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawCentroids(
  ctx: CanvasRenderingContext2D,
  centroids: Point[],
  projector: Projector,
  radius: number,
  alpha: number,
) {
  if (alpha <= 0 || radius <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  centroids.forEach((c, i) => {
    const [sx, sy] = projector.project(c);
    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.fillStyle = clusterColor(i);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = THEME.ring;
    ctx.stroke();
  });
  ctx.restore();
}

/** World-space length of the first `drawn` segments of an ordered node list. */
function pathLengthWorld(nodes: Point[], roundTrip: boolean, drawn: number): number {
  const n = nodes.length;
  if (n < 2) return 0;
  const total = roundTrip ? n : n - 1;
  const d = Math.max(0, Math.min(total, drawn));
  const full = Math.floor(d + 1e-9);
  const frac = d - full;
  const at = (i: number) => nodes[i % n];
  let len = 0;
  for (let k = 0; k < full; k++) {
    len += Math.hypot(at(k + 1).x - at(k).x, at(k + 1).y - at(k).y);
  }
  if (frac > 0 && full < total) {
    const a = at(full);
    const b = at(full + 1);
    len += Math.hypot(b.x - a.x, b.y - a.y) * frac;
  }
  return len;
}

/** Small "Route ≈ N m" readout in the top-left margin. */
function drawRouteLength(ctx: CanvasRenderingContext2D, meters: number, monoFamily: string) {
  ctx.save();
  ctx.font = `600 11px ${monoFamily}`;
  ctx.textAlign = "left";
  ctx.fillStyle = THEME.label;
  ctx.fillText(`Route ≈ ${Math.round(meters).toLocaleString()} m`, PADDING, PADDING - 9);
  ctx.restore();
}

interface RouteDrawOpts {
  roundTrip: boolean;
  monoFamily: string;
  /** How many segments of the route to draw (default: all). */
  drawn?: number;
  /** Draw a traveling drill-head marker at the growing tip. */
  showHead?: boolean;
  /** Draw sequence numbers on reached holes. */
  showNumbers?: boolean;
  /** Extra alpha multiplier for just the sequence numbers (to fade them in). */
  numberAlpha?: number;
  /** Draw start (and, on open paths, end) rings. */
  startEnd?: boolean;
  alpha?: number;
  /** Scale factor for the start ring (for the initial pulse). */
  startScale?: number;
}

/**
 * Draw the drilling route through `nodes` (in visiting order): the polyline up to the
 * drawn length, an optional traveling drill-head, sequence numbers on reached holes, and
 * distinct start / end rings. Reused by the animation and the static (PNG) render.
 */
function drawRoute(
  ctx: CanvasRenderingContext2D,
  nodes: Point[],
  projector: Projector,
  opts: RouteDrawOpts,
) {
  const n = nodes.length;
  if (n === 0) return;
  const {
    roundTrip,
    monoFamily,
    drawn = Infinity,
    showHead = false,
    showNumbers = false,
    numberAlpha = 1,
    startEnd = false,
    alpha = 1,
    startScale = 1,
  } = opts;

  const total = roundTrip ? n : n - 1;
  const d = Math.max(0, Math.min(total, drawn));
  const full = Math.floor(d + 1e-9);
  const frac = d - full;
  const P = nodes.map((nd) => projector.project(nd));
  const at = (i: number) => P[i % n];

  // Polyline + drill head.
  if (n >= 2 && d > 0) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = ROUTE.line;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(at(0)[0], at(0)[1]);
    for (let k = 1; k <= full; k++) ctx.lineTo(at(k)[0], at(k)[1]);
    let head = at(full);
    if (frac > 0 && full < total) {
      const a = at(full);
      const b = at(full + 1);
      head = [a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac];
      ctx.lineTo(head[0], head[1]);
    }
    ctx.stroke();
    ctx.restore();

    if (showHead && d < total - 1e-9) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(head[0], head[1], 5, 0, Math.PI * 2);
      ctx.fillStyle = ROUTE.head;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = THEME.ring;
      ctx.stroke();
      ctx.restore();
    }
  }

  // Sequence numbers on reached holes.
  if (showNumbers && numberAlpha > 0) {
    const reached = Math.min(n, full + 1);
    ctx.save();
    ctx.globalAlpha = alpha * numberAlpha;
    ctx.font = `600 10px ${monoFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < reached; i++) {
      const [sx, sy] = P[i];
      const ly = sy - 11;
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(251,248,241,0.92)";
      ctx.strokeText(String(i + 1), sx, ly);
      ctx.fillStyle = THEME.line;
      ctx.fillText(String(i + 1), sx, ly);
    }
    ctx.restore();
  }

  // Start / end rings.
  if (startEnd) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(P[0][0], P[0][1], 10 * startScale, 0, Math.PI * 2);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = ROUTE.start;
    ctx.stroke();
    if (!roundTrip && n >= 2) {
      ctx.beginPath();
      ctx.setLineDash([3, 3]);
      ctx.arc(P[n - 1][0], P[n - 1][1], 10, 0, Math.PI * 2);
      ctx.strokeStyle = ROUTE.end;
      ctx.stroke();
    }
    ctx.restore();
  }
}

function prepareCanvas(
  canvas: HTMLCanvasElement,
): { ctx: CanvasRenderingContext2D; mono: string } | null {
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== WIDTH * dpr) {
    canvas.width = WIDTH * dpr;
    canvas.height = HEIGHT * dpr;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const mono =
    getComputedStyle(canvas).getPropertyValue("--font-ibm-plex-mono").trim() ||
    "monospace";
  return { ctx, mono };
}

export const SitePlot = forwardRef<SitePlotHandle, SitePlotProps>(function SitePlot(
  {
    polygon,
    placements = [],
    drillTypes,
    animation = null,
    animate = false,
    onAnimationDone,
    highlightType = null,
    route = null,
    pickMode = null,
    onPickPoint,
  },
  ref,
) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [fontsReady, setFontsReady] = useState(false);

  const projector = useMemo(() => makeProjector(polygon), [polygon]);
  const hasPolygon = !!polygon && polygon.length >= 2;

  // Keep the completion callback in a ref so the animation effect doesn't restart
  // when the parent passes a new function identity.
  const doneRef = useRef(onAnimationDone);
  doneRef.current = onAnimationDone;
  const skipRef = useRef(false);

  useImperativeHandle(ref, () => ({
    toPng: () => canvasRef.current?.toDataURL("image/png") ?? null,
    skip: () => {
      skipRef.current = true;
    },
  }));

  // Redraw once the web fonts have loaded so graticule/scale labels render in
  // IBM Plex Mono instead of the fallback measured at first paint.
  useEffect(() => {
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (!cancelled) setFontsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Static render — used whenever we're not playing the k-means animation.
  useEffect(() => {
    if (animate) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const prepared = prepareCanvas(canvas);
    if (!prepared) return;
    drawStatic(
      prepared.ctx,
      polygon,
      placements,
      drillTypes,
      projector,
      hovered,
      prepared.mono,
      highlightType,
      route,
    );
  }, [animate, polygon, placements, drillTypes, projector, hovered, fontsReady, highlightType, route]);

  // Animation timeline. `animate === "full"` plays k-means then the route; `animate ===
  // "route"` replays only the route (e.g. after the start/end/round-trip changes) so a
  // recompute is always visible.
  useEffect(() => {
    if (!animate) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const prepared = prepareCanvas(canvas);
    if (!prepared) return;
    const { ctx, mono } = prepared;

    const finish = () => {
      drawStatic(ctx, polygon, placements, drillTypes, projector, hovered, mono, null, route);
      doneRef.current?.();
    };

    const frames = animation?.frames ?? [];
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!polygon || reduceMotion) {
      finish();
      return;
    }

    // K-means stages run only for the "full" clip; a "route" replay skips them entirely.
    const doKmeans = animate === "full" && frames.length > 0;
    const gridPoints = animation?.gridPoints ?? [];
    const stepCount = Math.max(1, frames.length - 1);
    const stepMs = Math.min(STEP_MAX_MS, Math.max(STEP_MIN_MS, ITER_TARGET_MS / stepCount));
    const sweepEnd = doKmeans ? SWEEP_MS : 0;
    const seedEnd = sweepEnd + (doKmeans ? SEED_MS : 0);
    const iterEnd = seedEnd + (doKmeans ? stepMs * stepCount : 0);
    const revealEnd = iterEnd + (doKmeans ? REVEAL_MS : 0);

    // Route (TSP) stages, played after the reveal (or immediately, for a route replay).
    // Placements are already in the route's visiting order, so a lookup by original index
    // lets us draw the recorded steps.
    const routeReady =
      !!route &&
      route.placements.length >= 2 &&
      placements.length >= 2 &&
      route.order.length === placements.length;
    const rRoundTrip = routeReady ? route!.roundTrip : false;
    const rLengths = routeReady ? route!.lengths : [];
    const rLength = routeReady ? route!.length : 0;
    let stepNodes: Point[][] = [];
    let nSeg = 0;
    let hopMs = 0;
    let optCount = 0;
    let optStepMs = 0;
    if (routeReady) {
      const nodeAt: Point[] = new Array(route!.order.length);
      route!.order.forEach((orig, i) => {
        nodeAt[orig] = placements[i];
      });
      stepNodes = route!.steps.map((s) => s.map((o) => nodeAt[o]));
      nSeg = rRoundTrip ? route!.order.length : route!.order.length - 1;
      hopMs = Math.min(
        ROUTE_HOP_MAX_MS,
        Math.max(ROUTE_HOP_MIN_MS, ROUTE_BUILD_TARGET_MS / Math.max(1, nSeg)),
      );
      optCount = Math.max(0, route!.steps.length - 1);
      optStepMs =
        optCount > 0
          ? Math.min(ROUTE_OPT_MAX_MS, Math.max(ROUTE_OPT_MIN_MS, ROUTE_OPT_TARGET_MS / optCount))
          : 0;
    }
    const markEnd = revealEnd + (routeReady ? ROUTE_MARK_MS : 0);
    const buildEnd = markEnd + hopMs * nSeg;
    const optEnd = buildEnd + optStepMs * optCount;
    const routeEnd = optEnd + (routeReady ? ROUTE_SETTLE_MS : 0);

    skipRef.current = false;
    let raf = 0;
    let start = 0;

    const render = (now: number) => {
      if (!start) start = now;
      let elapsed = now - start;
      if (skipRef.current) elapsed = routeEnd;

      drawBackground(ctx);
      drawGraticule(ctx, projector, mono);
      drawPolygon(ctx, polygon, projector);

      if (elapsed < sweepEnd) {
        // Stage 1: lay the interior grid over the area, left → right.
        const revealX = elapsed / SWEEP_MS;
        drawGridDots(ctx, gridPoints, projector, () => THEME.dot, 1, revealX);
      } else if (elapsed < seedEnd) {
        // Stage 2: drop the initial centroids.
        const f = easeInOut((elapsed - sweepEnd) / SEED_MS);
        drawGridDots(ctx, gridPoints, projector, () => THEME.dot, 1, null);
        drawCentroids(ctx, frames[0], projector, CENTROID_R * f, f);
      } else if (elapsed < iterEnd) {
        // Stage 3: iterate — color by nearest centroid, glide centroids to means.
        const local = elapsed - seedEnd;
        const idx = Math.min(stepCount - 1, Math.floor(local / stepMs));
        const f = easeInOut((local - idx * stepMs) / stepMs);
        const from = frames[idx];
        const to = frames[idx + 1] ?? frames[idx];
        const cur = from.map((c, i) => ({
          x: c.x + (to[i].x - c.x) * f,
          y: c.y + (to[i].y - c.y) * f,
        }));
        drawGridDots(
          ctx,
          gridPoints,
          projector,
          (p) => clusterColor(nearestIndex(p, cur)),
          1,
          null,
        );
        drawCentroids(ctx, cur, projector, CENTROID_R, 1);
      } else if (elapsed < revealEnd) {
        // Stage 4: fade grid out, crossfade centroids → type-colored placements.
        const f = easeInOut((elapsed - iterEnd) / REVEAL_MS);
        const final = frames[frames.length - 1];
        drawGridDots(
          ctx,
          gridPoints,
          projector,
          (p) => clusterColor(nearestIndex(p, final)),
          1 - f,
          null,
        );
        drawCentroids(ctx, final, projector, CENTROID_R, 1 - f);
        drawPlacements(ctx, placements, drillTypes, projector, null, f);
        drawScaleAndNorth(ctx, projector, mono);
      } else if (routeReady && elapsed < routeEnd) {
        // Route stages: hold the finished holes, then build + untangle the route on top.
        drawPlacements(ctx, placements, drillTypes, projector, null, 1);
        drawScaleAndNorth(ctx, projector, mono);
        const nn = stepNodes[0];
        if (elapsed < markEnd) {
          // Stage 5: pulse the start hole before setting off.
          const f = easeInOut((elapsed - revealEnd) / ROUTE_MARK_MS);
          drawRoute(ctx, nn, projector, {
            roundTrip: rRoundTrip,
            monoFamily: mono,
            drawn: 0,
            startEnd: true,
            startScale: 0.6 + 0.4 * f,
          });
          drawRouteLength(ctx, 0, mono);
        } else if (elapsed < buildEnd) {
          // Stage 6: greedy nearest-neighbor build, hop by hop.
          const drawn = Math.min(nSeg, (elapsed - markEnd) / hopMs);
          drawRoute(ctx, nn, projector, {
            roundTrip: rRoundTrip,
            monoFamily: mono,
            drawn,
            showHead: true,
            showNumbers: true,
            startEnd: true,
          });
          drawRouteLength(ctx, pathLengthWorld(nn, rRoundTrip, drawn), mono);
        } else if (elapsed < optEnd) {
          // Stage 7: 2-opt untangling — crossfade each accepted swap so unchanged edges
          // stay put while the two swapped edges fade over, length easing down.
          const t = (elapsed - buildEnd) / optStepMs; // 0 .. optCount
          const k = Math.min(optCount, Math.floor(t) + 1); // target step 1 .. optCount
          const f = easeInOut(Math.min(1, Math.max(0, t - (k - 1))));
          drawRoute(ctx, stepNodes[k - 1], projector, {
            roundTrip: rRoundTrip,
            monoFamily: mono,
            showNumbers: true,
            startEnd: true,
            alpha: 1 - f,
          });
          drawRoute(ctx, stepNodes[k], projector, {
            roundTrip: rRoundTrip,
            monoFamily: mono,
            showNumbers: true,
            startEnd: true,
            alpha: f,
          });
          drawRouteLength(ctx, rLengths[k - 1] + (rLengths[k] - rLengths[k - 1]) * f, mono);
        } else {
          // Stage 8: settle on the final optimized route.
          drawRoute(ctx, placements, projector, {
            roundTrip: rRoundTrip,
            monoFamily: mono,
            showNumbers: true,
            startEnd: true,
          });
          drawRouteLength(ctx, rLength, mono);
        }
      }

      drawFrame(ctx);

      if (elapsed >= routeEnd) {
        finish();
        return;
      }
      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
    // `hovered` is intentionally excluded: it never changes while animating and
    // including it would restart the timeline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate, animation, polygon, placements, drillTypes, projector, route]);

  const onMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (animate || !placements.length) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width) * WIDTH;
      const my = ((e.clientY - rect.top) / rect.height) * HEIGHT;
      let best: number | null = null;
      let bestDist = 14 * 14;
      placements.forEach((pl, idx) => {
        const [sx, sy] = projector.project(pl);
        const d = (sx - mx) ** 2 + (sy - my) ** 2;
        if (d < bestDist) {
          bestDist = d;
          best = idx;
        }
      });
      setHovered(best);
    },
    [animate, placements, projector],
  );

  const onClickCanvas = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      // An armed start/end pick wins, even mid route-replay, so the user isn't blocked.
      if (pickMode && onPickPoint && placements.length) {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const mx = ((e.clientX - rect.left) / rect.width) * WIDTH;
        const my = ((e.clientY - rect.top) / rect.height) * HEIGHT;
        let best: number | null = null;
        let bestDist = 18 * 18;
        placements.forEach((pl, idx) => {
          const [sx, sy] = projector.project(pl);
          const d = (sx - mx) ** 2 + (sy - my) ** 2;
          if (d < bestDist) {
            bestDist = d;
            best = idx;
          }
        });
        if (best != null) onPickPoint(best);
        return;
      }
      if (animate) skipRef.current = true; // otherwise a click skips the running animation
    },
    [animate, pickMode, onPickPoint, placements, projector],
  );

  const hoveredPlacement = hovered != null ? placements[hovered] : null;
  const hoveredScreen = hoveredPlacement ? projector.project(hoveredPlacement) : null;

  return (
    <div className="relative w-full overflow-hidden rounded-[11px] border border-hairline bg-map-paper">
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: "auto",
          display: "block",
          cursor: pickMode ? "crosshair" : "default",
        }}
        onMouseMove={onMove}
        onMouseLeave={() => setHovered(null)}
        onClick={onClickCanvas}
      />

      {!hasPolygon && !animate && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center p-5 text-center">
          <div className="font-mono text-xs uppercase tracking-[0.14em] text-[#bbae96]">
            {t.noArea}
          </div>
          <div className="mt-2 max-w-[280px] text-[13px] text-[#c3b69d]">
            {t.noAreaHint}
          </div>
        </div>
      )}

      {hoveredPlacement && hoveredScreen && (
        <div
          className="pointer-events-none absolute z-10 whitespace-nowrap rounded-[9px] bg-ink px-2.5 py-[7px]"
          style={{
            left: `${(hoveredScreen[0] / WIDTH) * 100}%`,
            top: `${(hoveredScreen[1] / HEIGHT) * 100}%`,
            transform: "translate(-50%,-115%)",
            boxShadow: "0 6px 20px rgba(42,36,25,0.28)",
            color: "#f3ead9",
          }}
        >
          <div className="font-mono text-[11.5px] font-semibold tracking-[0.02em]">
            <span className="text-[#cfc6b4]">{t.tipId} </span>
            {hoveredPlacement.id} ·{" "}
            <span style={{ color: drillTypes[hoveredPlacement.typeIndex]?.color ?? "#cfc6b4" }}>
              {drillTypes[hoveredPlacement.typeIndex]?.code ?? "?"}
            </span>
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-[#b8b09d]">
            {hoveredPlacement.x.toFixed(2)}, {hoveredPlacement.y.toFixed(2)}
          </div>
        </div>
      )}
    </div>
  );
});
