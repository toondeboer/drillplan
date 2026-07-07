"use client";

import { useState } from "react";
import { DrillGlyph } from "@/components/DrillGlyph";
import { DRILL_SYMBOLS, type DrillType } from "@/lib/algorithm/types";
import { useI18n } from "@/lib/i18n";

interface MeasurementControlsProps {
  drillTypes: DrillType[];
  counts: number[];
  onCountsChange: (counts: number[]) => void;
  onAddType: () => void;
  onDeleteType: (index: number) => void;
  onEditType: (index: number, patch: Partial<DrillType>) => void;
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

export function MeasurementControls({
  drillTypes,
  counts,
  onCountsChange,
  onAddType,
  onDeleteType,
  onEditType,
}: MeasurementControlsProps) {
  const { t } = useI18n();
  const [editing, setEditing] = useState<string | null>(null);
  const total = counts.reduce((a, b) => a + b, 0);

  return (
    <div>
      <p className="mb-3.5 text-[13px] text-ink-3">{t.countsHint}</p>
      <div className="flex flex-col gap-[9px]">
        {drillTypes.map((type, i) => {
          const isEditing = editing === type.id;
          return (
            <div
              key={type.id}
              className="overflow-hidden rounded-[11px] border border-hairline-2 bg-surface-inset"
            >
              <div className="flex items-center justify-between gap-3 px-[13px] py-[10px]">
                <div className="flex min-w-0 flex-1 items-center gap-[11px]">
                  <button
                    type="button"
                    onClick={() => setEditing(isEditing ? null : type.id)}
                    aria-expanded={isEditing}
                    title={t.editDrill}
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition ${
                      isEditing
                        ? "border-clay bg-clay-soft-bg"
                        : "border-hairline bg-white hover:border-[#cdbfa6]"
                    }`}
                  >
                    <DrillGlyph symbol={type.symbol} color={type.color} size={13} />
                  </button>
                  <input
                    type="text"
                    value={type.code}
                    onChange={(e) => onEditType(i, { code: e.target.value })}
                    aria-label={t.drillNameLabel}
                    spellCheck={false}
                    className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 font-mono text-[13px] font-semibold tracking-[0.02em] text-ink outline-none transition hover:border-hairline focus:border-clay-soft-border focus:bg-white"
                  />
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Stepper
                    value={counts[i] ?? 0}
                    color={type.color}
                    onChange={(v) => {
                      const next = counts.slice();
                      next[i] = v;
                      onCountsChange(next);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (editing === type.id) setEditing(null);
                      onDeleteType(i);
                    }}
                    disabled={drillTypes.length <= 1}
                    title={t.deleteDrill}
                    aria-label={t.deleteDrill}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-hairline bg-white text-[17px] leading-none text-ink-3 transition hover:border-[#e0b8a8] hover:bg-[#f8ece7] hover:text-[#9a3b1f] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-hairline disabled:hover:bg-white disabled:hover:text-ink-3"
                  >
                    ×
                  </button>
                </div>
              </div>

              {isEditing && (
                <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-hairline-2 bg-white/50 px-[13px] py-[11px]">
                  <label className="flex items-center gap-2 text-xs font-medium text-ink-3">
                    {t.drillColorLabel}
                    <input
                      type="color"
                      value={type.color}
                      onChange={(e) => onEditType(i, { color: e.target.value })}
                      aria-label={t.drillColorLabel}
                      className="h-7 w-9 cursor-pointer rounded-md border border-hairline bg-white p-0.5"
                    />
                  </label>
                  <div className="flex items-center gap-2 text-xs font-medium text-ink-3">
                    {t.drillSymbolLabel}
                    <div className="flex items-center gap-1">
                      {DRILL_SYMBOLS.map((sym) => {
                        const active = type.symbol === sym;
                        return (
                          <button
                            key={sym}
                            type="button"
                            aria-pressed={active}
                            aria-label={sym}
                            onClick={() => onEditType(i, { symbol: sym })}
                            className={`flex h-7 w-7 items-center justify-center rounded-lg border transition ${
                              active
                                ? "border-clay bg-clay-soft-bg"
                                : "border-hairline bg-white hover:border-[#cdbfa6]"
                            }`}
                          >
                            <DrillGlyph symbol={sym} color={type.color} size={13} />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onAddType}
        className="mt-[9px] flex w-full items-center justify-center gap-1.5 rounded-[11px] border border-dashed border-hairline-2 bg-surface-inset py-[10px] text-[13px] font-semibold text-ink-2 transition hover:border-clay-soft-border hover:text-clay"
      >
        <span className="text-[15px] leading-none">+</span> {t.addDrill}
      </button>

      <div className="mt-[13px] flex items-center justify-between rounded-[10px] border border-clay-soft-border bg-clay-soft-bg px-3.5 py-[11px]">
        <span className="text-[13px] font-medium text-[#8a4a26]">{t.totalLabelText}</span>
        <span className="font-mono text-base font-semibold text-clay">{total}</span>
      </div>
    </div>
  );
}
