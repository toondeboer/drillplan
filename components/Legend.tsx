"use client";

import { MEASUREMENT_TYPES, type Placement } from "@/lib/algorithm/types";

interface LegendProps {
  placements: Placement[];
  /** Currently highlighted measurement-type index, or null for none. */
  activeType?: number | null;
  /** Toggle the highlight for a measurement-type index. */
  onToggleType?: (typeIndex: number) => void;
}

export function Legend({ placements, activeType = null, onToggleType }: LegendProps) {
  const countByType = MEASUREMENT_TYPES.map(
    (_, i) => placements.filter((p) => p.typeIndex === i).length,
  );

  return (
    <div className="flex flex-wrap gap-[7px]">
      {MEASUREMENT_TYPES.map((type, i) => {
        const isActive = activeType === i;
        const disabled = countByType[i] === 0 || !onToggleType;
        return (
          <button
            key={type.code}
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
            <span
              className="h-[9px] w-[9px] rounded-full"
              style={{ backgroundColor: type.color }}
            />
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
