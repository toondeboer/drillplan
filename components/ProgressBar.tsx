"use client";

/**
 * Indeterminate busy indicator shown while the Web Worker computes. The
 * computation is real; this is purely the "working" affordance (spinner +
 * sliding clay bar), matching the cartographic design spec.
 */
export function ProgressBar({ label }: { label: string }) {
  return (
    <div>
      <div className="mb-[9px] flex items-center gap-2">
        <span
          className="inline-block h-[13px] w-[13px] rounded-full border-2 border-clay-soft-border"
          style={{ borderTopColor: "#bd5a2e", animation: "spin 0.7s linear infinite" }}
        />
        <span className="text-[13px] font-medium text-ink-2">{label}</span>
      </div>
      <div className="relative h-[9px] overflow-hidden rounded-full bg-hairline-2">
        <div
          className="absolute left-0 top-0 h-full w-[30%] rounded-full bg-clay"
          style={{ animation: "drillslide 1.1s ease-in-out infinite" }}
        />
      </div>
    </div>
  );
}
