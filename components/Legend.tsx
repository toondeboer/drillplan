"use client";

import { MEASUREMENT_TYPES, type Placement } from "@/lib/algorithm/types";

export function Legend({ placements }: { placements: Placement[] }) {
  const countByType = MEASUREMENT_TYPES.map(
    (_, i) => placements.filter((p) => p.typeIndex === i).length,
  );

  return (
    <div className="flex flex-wrap gap-[7px]">
      {MEASUREMENT_TYPES.map((type, i) => (
        <span
          key={type.code}
          className="inline-flex items-center gap-[7px] rounded-full border border-hairline-2 bg-surface-inset py-[5px] pl-[9px] pr-[11px]"
        >
          <span
            className="h-[9px] w-[9px] rounded-full"
            style={{ backgroundColor: type.color }}
          />
          <span className="font-mono text-[11.5px] font-semibold text-ink">{type.code}</span>
          <span className="font-mono text-[11.5px] text-ink-3">{countByType[i]}</span>
        </span>
      ))}
    </div>
  );
}
