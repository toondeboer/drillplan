import type { DrillSymbol } from "@/lib/algorithm/types";

interface DrillGlyphProps {
  symbol: DrillSymbol;
  color: string;
  /** Outer box size in px (default 12). */
  size?: number;
}

/**
 * A small inline-SVG marker matching the shapes drawn on the map (`drawSymbol` in SitePlot).
 * Reused by the drill-type list, the legend, and the symbol picker so swatches and map markers
 * stay in sync. Filled with `color` and given a faint outline for definition on any background.
 */
export function DrillGlyph({ symbol, color, size = 12 }: DrillGlyphProps) {
  const c = 6; // center in the 12×12 viewBox
  const r = 5; // nominal radius
  const common = {
    fill: color,
    stroke: "rgba(42,36,25,0.22)",
    strokeWidth: 0.9,
    strokeLinejoin: "round" as const,
  };

  let shape: React.ReactNode;
  switch (symbol) {
    case "square": {
      const s = r * 0.9;
      shape = <rect x={c - s} y={c - s} width={s * 2} height={s * 2} rx={0.6} {...common} />;
      break;
    }
    case "triangle": {
      const h = r * 1.15;
      shape = (
        <polygon
          points={`${c},${c - h} ${c + h * 0.95},${c + h * 0.72} ${c - h * 0.95},${c + h * 0.72}`}
          {...common}
        />
      );
      break;
    }
    case "diamond": {
      const d = r * 1.1;
      shape = (
        <polygon points={`${c},${c - d} ${c + d},${c} ${c},${c + d} ${c - d},${c}`} {...common} />
      );
      break;
    }
    case "circle":
    default:
      shape = <circle cx={c} cy={c} r={r} {...common} />;
      break;
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      aria-hidden
      className="shrink-0"
      style={{ display: "block" }}
    >
      {shape}
    </svg>
  );
}
