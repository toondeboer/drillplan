"use client";

import { DrillGlyph } from "@/components/DrillGlyph";
import { type DrillType, type Placement } from "@/lib/algorithm/types";

interface LegendProps {
  drillTypes: DrillType[];
  placements: Placement[];
  /** Currently highlighted drill-type index, or null for none. */
  activeType?: number | null;
  /** Toggle the highlight for a drill-type index. */
  onToggleType?: (typeIndex: number) => void;
}

export function Legend({ drillTypes, placements, activeType = null, onToggleType }: LegendProps) {
  const countByType = drillTypes.map(
    (_, i) => placements.filter((p) => p.typeIndex === i).length,
  );

  return (
    <div className="flex flex-wrap gap-[7px]">
      {drillTypes.map((type, i) => {
        const isActive = activeType === i;
        const disabled = countByType[i] === 0 || !onToggleType;
        return (
          <button
            key={type.id}
            type="button"
            disabled={disabled}
            aria-pressed={isActive}
            onClick={() => onToggleType?.(i)}
            title={disabled ? undefined : `Highlight ${type.code}`}
            className={`inline-flex items-center gap-[7px] rounded-full border py-[5px] pl-[9px] pr-[11px] transition ${
              isActive
                ? "border-clay bg-clay-soft-bg"
                : "border-hairline-2 bg-surface-inset"
            } ${
              disabled
                ? "cursor-default"
                : "cursor-pointer hover:border-clay-soft-border"
            } ${activeType != null && !isActive ? "opacity-55" : ""}`}
          >
            <DrillGlyph symbol={type.symbol} color={type.color} size={11} />
            <span className="font-mono text-[11.5px] font-semibold text-ink">
              {type.code}
            </span>
            <span className="font-mono text-[11.5px] text-ink-3">{countByType[i]}</span>
          </button>
        );
      })}
    </div>
  );
}
