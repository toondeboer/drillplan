"use client";

import { MEASUREMENT_TYPES } from "@/lib/algorithm/types";
import { useI18n } from "@/lib/i18n";

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
  const set = (v: number) => onChange(Math.max(0, Math.min(999, isNaN(v) ? 0 : v)));
  const btn =
    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-hairline bg-white text-[17px] font-semibold leading-none text-ink-2 transition hover:border-[#cdbfa6] hover:bg-[#f3ede0]";
  return (
    <div className="flex shrink-0 items-center gap-[7px]">
      <button type="button" aria-label="decrease" onClick={() => set(value - 1)} className={btn}>
        −
      </button>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => set(parseInt(e.target.value || "0", 10))}
        className="w-[50px] rounded-lg border border-hairline bg-white px-0.5 py-[7px] text-center font-mono text-[15px] font-semibold outline-none"
        style={{ color }}
      />
      <button type="button" aria-label="increase" onClick={() => set(value + 1)} className={btn}>
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
      <p className="mb-3.5 text-[13px] text-ink-3">{t.countsHint}</p>
      <div className="flex flex-col gap-[9px]">
        {MEASUREMENT_TYPES.map((type, i) => (
          <div
            key={type.code}
            className="flex items-center justify-between gap-3 rounded-[11px] border border-hairline-2 bg-surface-inset px-[13px] py-[11px]"
          >
            <div className="flex min-w-0 items-center gap-[11px]">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: type.color }}
              />
              <div className="min-w-0">
                <div className="font-mono text-[13px] font-semibold tracking-[0.02em] text-ink">
                  {type.code}
                </div>
                <div className="whitespace-nowrap text-xs text-ink-3">
                  {t.types[type.code]}
                </div>
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
        ))}
      </div>
      <div className="mt-[13px] flex items-center justify-between rounded-[10px] border border-clay-soft-border bg-clay-soft-bg px-3.5 py-[11px]">
        <span className="text-[13px] font-medium text-[#8a4a26]">{t.totalLabelText}</span>
        <span className="font-mono text-base font-semibold text-clay">{total}</span>
      </div>
    </div>
  );
}
