"use client";

import { MEASUREMENT_TYPES } from "@/lib/algorithm/types";
import { format, useI18n } from "@/lib/i18n";

interface MeasurementControlsProps {
  counts: number[];
  onChange: (counts: number[]) => void;
}

function Stepper({
  value,
  onChange,
  color,
}: {
  value: number;
  onChange: (v: number) => void;
  color: string;
}) {
  const set = (v: number) => onChange(Math.max(0, Math.min(999, v)));
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label="decrease"
        onClick={() => set(value - 1)}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-lg font-semibold text-slate-600 transition hover:bg-slate-50 active:scale-95"
      >
        −
      </button>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => set(parseInt(e.target.value || "0", 10))}
        className="w-14 rounded-lg border border-slate-200 px-2 py-1.5 text-center text-base font-semibold tabular-nums outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
        style={{ color }}
      />
      <button
        type="button"
        aria-label="increase"
        onClick={() => set(value + 1)}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-lg font-semibold text-slate-600 transition hover:bg-slate-50 active:scale-95"
      >
        +
      </button>
    </div>
  );
}

export function MeasurementControls({ counts, onChange }: MeasurementControlsProps) {
  const { t } = useI18n();
  const total = counts.reduce((a, b) => a + b, 0);

  return (
    <div>
      <p className="mb-4 text-sm text-slate-500">{t.countsHint}</p>
      <div className="space-y-2">
        {MEASUREMENT_TYPES.map((type, i) => {
          const strings = t.types[type.code];
          return (
            <div
              key={type.code}
              className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span
                  className="h-3.5 w-3.5 shrink-0 rounded-full"
                  style={{ backgroundColor: type.color }}
                />
                <div>
                  <div className="font-semibold text-slate-800">{strings.label}</div>
                  <div className="text-sm text-slate-400">{strings.description}</div>
                </div>
              </div>
              <Stepper
                value={counts[i]}
                color={type.color}
                onChange={(v) => {
                  const next = counts.slice();
                  next[i] = v;
                  onChange(next);
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex items-center justify-between rounded-xl bg-brand-50 px-4 py-3">
        <span className="text-sm font-medium text-brand-800">
          {format(t.totalHoles, { n: total })}
        </span>
      </div>
    </div>
  );
}
