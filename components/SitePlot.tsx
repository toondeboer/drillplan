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
import { getBounds } from "@/lib/algorithm/geometry";
import { MEASUREMENT_TYPES, type Placement, type Point } from "@/lib/algorithm/types";
import { useI18n } from "@/lib/i18n";

const WIDTH = 880;
const HEIGHT = 600;
const PADDING = 48;

export interface SitePlotHandle {
  toPng: () => string | null;
}

interface SitePlotProps {
  polygon: Point[];
  placements?: Placement[];
}

interface Projector {
  project: (p: Point) => [number, number];
}

function makeProjector(polygon: Point[]): Projector {
  const { minX, maxX, minY, maxY } = getBounds(polygon);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const availW = WIDTH - PADDING * 2;
  const availH = HEIGHT - PADDING * 2;
  const scale = Math.min(availW / spanX, availH / spanY);
  const drawW = spanX * scale;
  const drawH = spanY * scale;
  const offsetX = PADDING + (availW - drawW) / 2;
  const offsetY = PADDING + (availH - drawH) / 2;
  return {
    project: (p: Point) => [
      offsetX + (p.x - minX) * scale,
      offsetY + (maxY - p.y) * scale, // flip Y so north is up
    ],
  };
}

function draw(
  ctx: CanvasRenderingContext2D,
  polygon: Point[],
  placements: Placement[],
  projector: Projector,
  hovered: number | null,
) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);

  // Site outline
  if (polygon.length >= 2) {
    ctx.beginPath();
    polygon.forEach((p, i) => {
      const [sx, sy] = projector.project(p);
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    });
    ctx.closePath();
    ctx.fillStyle = "rgba(51, 123, 255, 0.07)";
    ctx.fill();
    ctx.lineJoin = "round";
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#1d5cf0";
    ctx.stroke();
  }

  // Placements
  placements.forEach((pl, idx) => {
    const [sx, sy] = projector.project(pl);
    const color = MEASUREMENT_TYPES[pl.typeIndex].color;
    const isHover = hovered === idx;
    const r = isHover ? 8 : 6;
    if (isHover) {
      ctx.beginPath();
      ctx.arc(sx, sy, r + 4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(15, 23, 42, 0.12)";
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
  });
}

export const SitePlot = forwardRef<SitePlotHandle, SitePlotProps>(function SitePlot(
  { polygon, placements = [] },
  ref,
) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  const projector = useMemo(() => makeProjector(polygon), [polygon]);

  useImperativeHandle(ref, () => ({
    toPng: () => canvasRef.current?.toDataURL("image/png") ?? null,
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = WIDTH * dpr;
    canvas.height = HEIGHT * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    draw(ctx, polygon, placements, projector, hovered);
  }, [polygon, placements, projector, hovered]);

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
  const hoveredScreen = hoveredPlacement
    ? projector.project(hoveredPlacement)
    : null;

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-slate-200 bg-white">
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "auto", display: "block" }}
        onMouseMove={onMove}
        onMouseLeave={() => setHovered(null)}
      />
      {hoveredPlacement && hoveredScreen && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs text-white shadow-lg"
          style={{
            left: `${(hoveredScreen[0] / WIDTH) * 100}%`,
            top: `${(hoveredScreen[1] / HEIGHT) * 100}%`,
            marginTop: -10,
          }}
        >
          <div className="font-semibold">
            {t.tipId} {hoveredPlacement.id} ·{" "}
            <span style={{ color: MEASUREMENT_TYPES[hoveredPlacement.typeIndex].color }}>
              {MEASUREMENT_TYPES[hoveredPlacement.typeIndex].code}
            </span>
          </div>
          <div className="tabular-nums text-slate-300">
            {hoveredPlacement.x.toFixed(2)}, {hoveredPlacement.y.toFixed(2)}
          </div>
        </div>
      )}
    </div>
  );
});
