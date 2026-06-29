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
import { MEASUREMENT_TYPES, type Placement, type Point } from "@/lib/algorithm/types";
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
} as const;

export interface SitePlotHandle {
  toPng: () => string | null;
}

interface SitePlotProps {
  polygon: Point[] | null;
  placements?: Placement[];
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

function draw(
  ctx: CanvasRenderingContext2D,
  polygon: Point[] | null,
  placements: Placement[],
  projector: Projector,
  hovered: number | null,
  monoFamily: string,
) {
  const hasPoly = !!polygon && polygon.length >= 2;
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = THEME.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Graticule
  ctx.lineWidth = 1;
  ctx.strokeStyle = THEME.grid;
  if (hasPoly) {
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
  } else {
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

  // Frame
  ctx.strokeStyle = THEME.frame;
  ctx.lineWidth = 1;
  ctx.strokeRect(PADDING, PADDING, WIDTH - 2 * PADDING, HEIGHT - 2 * PADDING);

  if (!hasPoly || !polygon) return;

  // Site polygon
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

  // Placements
  placements.forEach((pl, idx) => {
    const [sx, sy] = projector.project(pl);
    const color = MEASUREMENT_TYPES[pl.typeIndex].color;
    const isHover = hovered === idx;
    const r = isHover ? 8 : 5.5;
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

export const SitePlot = forwardRef<SitePlotHandle, SitePlotProps>(function SitePlot(
  { polygon, placements = [] },
  ref,
) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [fontsReady, setFontsReady] = useState(false);

  const projector = useMemo(() => makeProjector(polygon), [polygon]);
  const hasPolygon = !!polygon && polygon.length >= 2;

  useImperativeHandle(ref, () => ({
    toPng: () => canvasRef.current?.toDataURL("image/png") ?? null,
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== WIDTH * dpr) {
      canvas.width = WIDTH * dpr;
      canvas.height = HEIGHT * dpr;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const monoFamily =
      getComputedStyle(canvas).getPropertyValue("--font-ibm-plex-mono").trim() ||
      "monospace";
    draw(ctx, polygon, placements, projector, hovered, monoFamily);
  }, [polygon, placements, projector, hovered, fontsReady]);

  const onMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!placements.length) return;
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
    [placements, projector],
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
      />

      {!hasPolygon && (
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
