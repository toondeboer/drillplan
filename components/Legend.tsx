"use client";

import { MEASUREMENT_TYPES, type Placement } from "@/lib/algorithm/types";
import { useI18n } from "@/lib/i18n";

export function Legend({ placements }: { placements: Placement[] }) {
  const { t } = useI18n();
  const countByType = MEASUREMENT_TYPES.map(
    (_, i) => placements.filter((p) => p.typeIndex === i).length,
  );

  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
        {t.legend}
      </h4>
      <ul className="space-y-1.5">
        {MEASUREMENT_TYPES.map((type, i) => (
          <li key={type.code} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: type.color }}
              />
              <span className="font-medium text-slate-700">{type.code}</span>
              <span className="text-slate-400">{t.types[type.code].description}</span>
            </span>
            <span className="tabular-nums font-semibold text-slate-500">
              {countByType[i]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
