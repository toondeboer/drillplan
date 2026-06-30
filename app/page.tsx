"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { FileUpload } from "@/components/FileUpload";
import { Legend } from "@/components/Legend";
import { LanguageToggle } from "@/components/LanguageToggle";
import { MeasurementControls } from "@/components/MeasurementControls";
import { ProgressBar } from "@/components/ProgressBar";
import { SitePlot, type SitePlotHandle } from "@/components/SitePlot";
import { downloadFile, parseAreaCsv, placementsToCsv, polygonToCsv } from "@/lib/csv";
import { generateExamplePolygon } from "@/lib/exampleArea";
import {
  type ComputeInput,
  type ComputeResult,
  type Placement,
  type Point,
  type WorkerOutMessage,
} from "@/lib/algorithm/types";
import { format, useI18n } from "@/lib/i18n";

type Status = "idle" | "computing" | "animating" | "done" | "error";

function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, "") || "drillplan";
}

/**
 * The "Spread" readout: the smallest distance between any two placements of the
 * same measurement type — i.e. the guaranteed minimum same-type separation, in
 * the polygon's units (metres). Returns null when no type has two or more holes
 * (so there is no same-type pair to measure). Derived purely from the result.
 */
function minSameTypeDistance(placements: Placement[]): number | null {
  let min = Infinity;
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      if (placements[i].typeIndex !== placements[j].typeIndex) continue;
      const dx = placements[i].x - placements[j].x;
      const dy = placements[i].y - placements[j].y;
      const d = Math.hypot(dx, dy);
      if (d < min) min = d;
    }
  }
  return Number.isFinite(min) ? min : null;
}

function StepBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md border border-clay-soft-border bg-clay-soft-bg-2 px-[7px] py-[3px] font-mono text-xs font-semibold tracking-[0.04em] text-clay">
      {children}
    </span>
  );
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{children}</h2>
  );
}

export default function Home() {
  const { t } = useI18n();

  const [polygon, setPolygon] = useState<Point[] | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [counts, setCounts] = useState<number[]>([5, 3, 2, 4]);

  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<ComputeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [highlightedType, setHighlightedType] = useState<number | null>(null);

  const plotRef = useRef<SitePlotHandle>(null);

  const total = counts.reduce((a, b) => a + b, 0);

  const spread = useMemo(
    () => (result ? minSameTypeDistance(result.placements) : null),
    [result],
  );

  const loadFile = useCallback(async (file: File) => {
    setError(null);
    setResult(null);
    setStatus("idle");
    setHighlightedType(null);
    try {
      const { polygon } = await parseAreaCsv(file);
      setPolygon(polygon);
      setFileName(file.name);
    } catch (err) {
      setPolygon(null);
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const loadExample = useCallback(() => {
    setError(null);
    setResult(null);
    setStatus("idle");
    setHighlightedType(null);
    setPolygon(generateExamplePolygon());
    setFileName("example-site.csv");
  }, []);

  const handleDownloadExample = useCallback(() => {
    downloadFile("drillplan-example.csv", polygonToCsv(generateExamplePolygon()));
  }, []);

  const runCompute = useCallback(() => {
    if (!polygon || total < 1) return;
    setStatus("computing");
    setError(null);
    setResult(null);
    setHighlightedType(null);

    const worker = new Worker(
      new URL("../workers/compute.worker.ts", import.meta.url),
      { type: "module" },
    );
    const input: ComputeInput = { polygon, counts, captureAnimation: true };

    worker.onmessage = (e: MessageEvent<WorkerOutMessage>) => {
      const msg = e.data;
      if (msg.type === "result") {
        setResult(msg.result);
        setStatus(msg.result.animation ? "animating" : "done");
        worker.terminate();
      } else if (msg.type === "error") {
        setError(msg.message);
        setStatus("error");
        worker.terminate();
      }
      // "progress" messages are ignored — the busy indicator is indeterminate.
    };
    worker.onerror = (e) => {
      setError(e.message || "Worker error");
      setStatus("error");
      worker.terminate();
    };
    worker.postMessage(input);
  }, [polygon, counts, total]);

  const handleDownloadCsv = useCallback(() => {
    if (!result) return;
    downloadFile(`${baseName(fileName)}_result.csv`, placementsToCsv(result.placements));
  }, [result, fileName]);

  const handleAnimationDone = useCallback(() => setStatus("done"), []);

  const handleReplay = useCallback(() => {
    if (result?.animation) {
      setHighlightedType(null);
      setStatus("animating");
    }
  }, [result]);

  const toggleHighlight = useCallback((typeIndex: number) => {
    setHighlightedType((cur) => (cur === typeIndex ? null : typeIndex));
  }, []);

  const handleDownloadImage = useCallback(() => {
    const url = plotRef.current?.toPng();
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${baseName(fileName)}_map.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [fileName]);

  const computing = status === "computing";

  return (
    <div className="mx-auto max-w-[1180px] px-7 pb-[60px] pt-[26px]">
      {/* Header */}
      <header className="flex items-center justify-between gap-[18px] border-b border-divider pb-[18px]">
        <div className="flex items-center gap-3">
          <svg width="36" height="36" viewBox="0 0 40 40" fill="none" aria-hidden>
            <polygon
              points="7,15 19,6 33,12 36,28 23,35 8,29"
              fill="rgba(189,90,46,0.10)"
              stroke="#bd5a2e"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <circle cx="13" cy="17" r="2.5" fill="#d2a24c" />
            <circle cx="27" cy="13" r="2.5" fill="#bf7233" />
            <circle cx="20.5" cy="23" r="2.5" fill="#8f3f1f" />
            <circle cx="14" cy="28" r="2.5" fill="#2f6b73" />
            <circle cx="30" cy="25" r="2.5" fill="#bd5a2e" />
          </svg>
          <div className="leading-[1.05]">
            <div className="text-[19px] font-bold tracking-[-0.02em] text-ink">
              {t.appName}
            </div>
            <div className="mt-0.5 font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-3">
              Site investigation planner
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3.5">
          <div className="hidden items-center gap-[7px] rounded-full border border-divider bg-[#f7f2e7] px-3 py-[5px] sm:flex">
            <span className="h-[7px] w-[7px] rounded-full bg-[#3f7a4e]" />
            <span className="font-mono text-[10.5px] tracking-[0.02em] text-ink-2">
              {t.privacy}
            </span>
          </div>
          <LanguageToggle />
        </div>
      </header>

      {/* Hero */}
      <div className="mb-[26px] mt-[30px] max-w-[700px]">
        <h1 className="text-[34px] font-bold leading-[1.1] tracking-[-0.025em] text-ink [text-wrap:balance]">
          {t.tagline}
        </h1>
        <p className="mt-3.5 max-w-[620px] text-[15.5px] leading-[1.6] text-ink-2">
          {t.intro}
        </p>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 items-start gap-[22px] min-[880px]:grid-cols-[368px_minmax(0,1fr)]">
        {/* Left rail */}
        <div className="flex flex-col gap-[18px]">
          {/* Step 1 */}
          <section className="rounded-[14px] border border-hairline bg-surface p-[22px]">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <StepBadge>01</StepBadge>
                <CardTitle>{t.step1Title}</CardTitle>
              </div>
              {polygon && (
                <button
                  type="button"
                  onClick={() => {
                    setPolygon(null);
                    setResult(null);
                    setStatus("idle");
                    setError(null);
                  }}
                  className="cursor-pointer text-[13px] font-medium text-ink-3 transition hover:text-ink"
                >
                  {t.changeFile}
                </button>
              )}
            </div>

            {polygon ? (
              <div className="flex items-center gap-3 rounded-[11px] border border-[#cfe0d0] bg-[#eef5ec] px-[15px] py-[13px]">
                <span className="h-[9px] w-[9px] shrink-0 rounded-full bg-[#3f7a4e]" />
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-semibold text-ink">{fileName}</div>
                  <div className="mt-px font-mono text-[11.5px] text-[#6f7d6b]">
                    {format(t.vertexLabel, { n: polygon.length })}
                  </div>
                </div>
              </div>
            ) : (
              <FileUpload
                onFile={loadFile}
                onExample={loadExample}
                onDownloadExample={handleDownloadExample}
              />
            )}
          </section>

          {/* Step 2 */}
          <section className="rounded-[14px] border border-hairline bg-surface p-[22px]">
            <div className="mb-3.5 flex items-center gap-2.5">
              <StepBadge>02</StepBadge>
              <CardTitle>{t.step2Title}</CardTitle>
            </div>
            <MeasurementControls counts={counts} onChange={setCounts} />

            <div className="mt-4">
              {computing ? (
                <ProgressBar label={t.computing} />
              ) : (
                <button
                  type="button"
                  onClick={runCompute}
                  disabled={!polygon || total < 1}
                  className="w-full rounded-[11px] py-[13px] text-[15px] font-semibold transition enabled:cursor-pointer enabled:bg-clay enabled:text-clay-on enabled:hover:bg-clay-hover disabled:cursor-not-allowed disabled:bg-divider disabled:text-ink-4"
                >
                  {status === "done" || status === "animating" ? t.recompute : t.compute}
                </button>
              )}
              {total < 1 && polygon && (
                <p className="mt-[9px] text-center text-[12.5px] text-[#b07b1d]">
                  {t.needAtLeastOne}
                </p>
              )}
            </div>
          </section>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-[18px]">
          <section className="rounded-[14px] border border-hairline bg-surface p-[22px]">
            <div className="mb-[15px] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <StepBadge>03</StepBadge>
                <CardTitle>{t.step3Title}</CardTitle>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-[10.5px] tracking-[0.04em] text-ink-4">
                  RD · EPSG:28992
                </span>
                {status === "animating" && (
                  <button
                    type="button"
                    onClick={() => plotRef.current?.skip()}
                    className="cursor-pointer rounded-full border border-hairline-2 bg-surface px-[11px] py-1 font-mono text-xs font-semibold text-ink-2 transition hover:text-ink"
                  >
                    » {t.skipAnimation}
                  </button>
                )}
                {status === "done" && result?.animation && (
                  <button
                    type="button"
                    onClick={handleReplay}
                    className="cursor-pointer rounded-full border border-hairline-2 bg-surface px-[11px] py-1 font-mono text-xs font-semibold text-ink-2 transition hover:text-ink"
                  >
                    ↺ {t.replayAnimation}
                  </button>
                )}
                {result && (
                  <span className="rounded-full bg-clay-soft-bg-2 px-[11px] py-1 font-mono text-xs font-semibold text-clay">
                    {format(t.resultChip, { n: result.placements.length })}
                  </span>
                )}
              </div>
            </div>

            <SitePlot
              ref={plotRef}
              polygon={polygon}
              placements={result?.placements}
              animation={result?.animation ?? null}
              animate={status === "animating"}
              onAnimationDone={handleAnimationDone}
              highlightType={highlightedType}
            />

            {status === "done" && result && (
              <>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5">
                  <Legend
                    placements={result.placements}
                    activeType={highlightedType}
                    onToggleType={toggleHighlight}
                  />
                  <div className="flex items-center gap-2 rounded-full border border-hairline-2 bg-surface-inset px-[13px] py-[5px]">
                    <span className="text-[11.5px] text-ink-3">{t.spreadScore}</span>
                    <span className="font-mono text-[13px] font-semibold text-ink">
                      {spread == null ? "—" : `${Math.round(spread).toLocaleString()} m`}
                    </span>
                  </div>
                </div>
                <div className="mt-4 flex gap-[11px]">
                  <button
                    type="button"
                    onClick={handleDownloadCsv}
                    className="flex-1 cursor-pointer rounded-[10px] bg-ink py-[11px] text-[13.5px] font-semibold text-[#f3ead9] transition hover:bg-[#423a2c]"
                  >
                    {t.downloadCsv}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadImage}
                    className="flex-1 cursor-pointer rounded-[10px] border border-[#d8cdb6] bg-white py-[11px] text-[13.5px] font-semibold text-ink transition hover:bg-[#f6f0e4]"
                  >
                    {t.downloadImage}
                  </button>
                </div>
              </>
            )}
          </section>

          {error && (
            <div className="rounded-[14px] border border-[#e6c0b4] bg-[#f8ebe6] px-5 py-4">
              <h3 className="text-[14px] font-semibold text-[#9a3b1f]">{t.errorTitle}</h3>
              <p className="mt-1.5 text-[13px] leading-[1.5] text-[#a05a40]">{error}</p>
            </div>
          )}

          <section className="rounded-[14px] border border-hairline-2 bg-surface-2 px-[22px] py-5">
            <h3 className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-4">
              {t.aboutTitle}
            </h3>
            <p className="text-[13.5px] leading-[1.65] text-ink-2">{t.about}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
