"use client";

import { useCallback, useRef } from "react";

interface AngleDialProps {
  /** Current grid angle in radians. A square raster repeats every 90°, so only [0, π/2) matters. */
  angle: number;
  /** Fired with a new angle (radians, wrapped to [0, π/2)) as the user turns the dial. */
  onChange: (angle: number) => void;
  size?: number;
  disabled?: boolean;
  title?: string;
}

const HALF_PI = Math.PI / 2;

/** Wrap any angle into [0, π/2) — the meaningful range for a 90°-symmetric square lattice. */
function wrapQuadrant(a: number): number {
  a %= HALF_PI;
  return a < 0 ? a + HALF_PI : a;
}

/**
 * A turnable compass for the raster rotation. Because a square grid's two axes are
 * perpendicular and interchangeable, the dial shows a rotating "+" (both axes drawn equally),
 * which makes the 90° wrap seamless. Drag it, or focus it and use the arrow keys.
 */
export function AngleDial({ angle, onChange, size = 60, disabled = false, title }: AngleDialProps) {
  const ref = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);

  // World u-axis (cos a, sin a) appears on the (y-down) screen at screen-angle −a, so the SVG
  // group is rotated by −aDeg and, conversely, a pointer at screen-angle φ means angle −φ.
  const aDeg = (angle * 180) / Math.PI;

  const angleFromEvent = useCallback((e: React.PointerEvent<SVGSVGElement>): number => {
    const el = ref.current;
    if (!el) return angle;
    const rect = el.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    if (dx === 0 && dy === 0) return angle;
    return wrapQuadrant(-Math.atan2(dy, dx));
  }, [angle]);

  const onPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (disabled) return;
    e.preventDefault();
    dragging.current = true;
    ref.current?.setPointerCapture(e.pointerId);
    onChange(angleFromEvent(e));
  }, [disabled, onChange, angleFromEvent]);

  const onPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging.current) return;
    onChange(angleFromEvent(e));
  }, [onChange, angleFromEvent]);

  const endDrag = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    dragging.current = false;
    ref.current?.releasePointerCapture?.(e.pointerId);
  }, []);

  const onKeyDown = useCallback((e: React.KeyboardEvent<SVGSVGElement>) => {
    if (disabled) return;
    const step = (e.shiftKey ? 5 : 1) * (Math.PI / 180);
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      onChange(wrapQuadrant(angle + step)); // turn counter-clockwise
    } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      onChange(wrapQuadrant(angle - step));
    }
  }, [disabled, angle, onChange]);

  const c = size / 2;
  const r = c - 4;
  const clay = "#bd5a2e";
  const ticks = Array.from({ length: 12 }, (_, i) => (i * Math.PI) / 6); // every 15°

  return (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="slider"
      aria-label={title ?? "Grid angle"}
      aria-valuemin={0}
      aria-valuemax={90}
      aria-valuenow={Math.round(aDeg)}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      style={{
        touchAction: "none",
        cursor: disabled ? "default" : "grab",
        outline: "none",
        opacity: disabled ? 0.5 : 1,
        display: "block",
      }}
    >
      <circle cx={c} cy={c} r={r} fill="#fffdf7" stroke="#e1d7c3" strokeWidth={1} />
      {ticks.map((t, i) => {
        const inner = i % 3 === 0 ? r - 5 : r - 3; // longer ticks at 0/90/180/270
        return (
          <line
            key={i}
            x1={c + Math.cos(t) * inner}
            y1={c + Math.sin(t) * inner}
            x2={c + Math.cos(t) * (r - 1)}
            y2={c + Math.sin(t) * (r - 1)}
            stroke="#c9bda3"
            strokeWidth={1}
          />
        );
      })}
      {/* Rotating perpendicular axes (the raster orientation). */}
      <g transform={`rotate(${-aDeg} ${c} ${c})`}>
        <line x1={c - r + 3} y1={c} x2={c + r - 3} y2={c} stroke={clay} strokeWidth={2} strokeLinecap="round" />
        <line x1={c} y1={c - r + 3} x2={c} y2={c + r - 3} stroke={clay} strokeWidth={2} strokeLinecap="round" />
        {[[c + r - 3, c], [c - r + 3, c], [c, c + r - 3], [c, c - r + 3]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={2.4} fill={clay} />
        ))}
      </g>
      <circle cx={c} cy={c} r={2} fill="#8a7a5c" />
    </svg>
  );
}
