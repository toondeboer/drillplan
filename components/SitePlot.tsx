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
  MEASUREMENT_TYPES,
  type KMeansAnimation,
  type Placement,
  type Point,
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

const CENTROID_R = 7;
const GRID_DOT_R = 1.7;

export interface SitePlotHandle {
  toPng: () => string | null;
  /** Jump the running k-means animation straight to the final result. */
  skip: () => void;
}

interface SitePlotProps {
  polygon: Point[] | null;
  placements?: Placement[];
  animation?: KMeansAnimation | null;
  animate?: boolean;
  onAnimationDone?: () => void;
  /** When set, only placements of this measurement-type index are emphasized. */
  highlightType?: number | null;
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

function drawPlacements(
  ctx: CanvasRenderingContext2D,
  placements: Placement[],
  projector: Projector,
  hovered: number | null,
  alpha = 1,
  highlightType: number | null = null,
) {
  ctx.save();
  placements.forEach((pl, idx) => {
    const [sx, sy] = projector.project(pl);
    const color = MEASUREMENT_TYPES[pl.typeIndex].color;
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
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
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
  projector: Projector,
  hovered: number | null,
  monoFamily: string,
  highlightType: number | null = null,
) {
  const hasPoly = !!polygon && polygon.length >= 2;
  drawBackground(ctx);
  if (hasPoly) drawGraticule(ctx, projector, monoFamily);
  else drawPlaceholderGrid(ctx);
  drawFrame(ctx);
  if (!hasPoly || !polygon) return;
  drawPolygon(ctx, polygon, projector);
  drawPlacements(ctx, placements, projector, hovered, 1, highlightType);
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
    animation = null,
    animate = false,
    onAnimationDone,
    highlightType = null,
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
      projector,
      hovered,
      prepared.mono,
      highlightType,
    );
  }, [animate, polygon, placements, projector, hovered, fontsReady, highlightType]);

  // K-means animation timeline.
  useEffect(() => {
    if (!animate) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const prepared = prepareCanvas(canvas);
    if (!prepared) return;
    const { ctx, mono } = prepared;

    const finish = () => {
      drawStatic(ctx, polygon, placements, projector, hovered, mono);
      doneRef.current?.();
    };

    const frames = animation?.frames ?? [];
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!polygon || frames.length === 0 || reduceMotion) {
      finish();
      return;
    }

    const gridPoints = animation!.gridPoints;
    const stepCount = Math.max(1, frames.length - 1);
    const stepMs = Math.min(
      STEP_MAX_MS,
      Math.max(STEP_MIN_MS, ITER_TARGET_MS / stepCount),
    );
    const iterMs = stepMs * stepCount;
    const sweepEnd = SWEEP_MS;
    const seedEnd = sweepEnd + SEED_MS;
    const iterEnd = seedEnd + iterMs;
    const revealEnd = iterEnd + REVEAL_MS;

    skipRef.current = false;
    let raf = 0;
    let start = 0;

    const render = (now: number) => {
      if (!start) start = now;
      let elapsed = now - start;
      if (skipRef.current) elapsed = revealEnd;

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
        drawPlacements(ctx, placements, projector, null, f);
        drawScaleAndNorth(ctx, projector, mono);
      }

      drawFrame(ctx);

      if (elapsed >= revealEnd) {
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
  }, [animate, animation, polygon, placements, projector]);

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

  const hoveredPlacement = hovered != null ? placements[hovered] : null;
  const hoveredScreen = hoveredPlacement ? projector.project(hoveredPlacement) : null;

  return (
    <div className="relative w-full overflow-hidden rounded-[11px] border border-hairline bg-map-paper">
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "auto", display: "block" }}
        onMouseMove={onMove}
        onMouseLeave={() => setHovered(null)}
        onClick={() => {
          if (animate) skipRef.current = true;
        }}
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
            <span style={{ color: MEASUREMENT_TYPES[hoveredPlacement.typeIndex].color }}>
              {MEASUREMENT_TYPES[hoveredPlacement.typeIndex].code}
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
