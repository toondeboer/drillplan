"use client";

import { useCallback, useRef, useState } from "react";
import { FileUpload } from "@/components/FileUpload";
import { Legend } from "@/components/Legend";
import { LanguageToggle } from "@/components/LanguageToggle";
import { MeasurementControls } from "@/components/MeasurementControls";
import { ProgressBar } from "@/components/ProgressBar";
import { SitePlot, type SitePlotHandle } from "@/components/SitePlot";
import {
  downloadFile,
  parseAreaCsv,
  placementsToCsv,
} from "@/lib/csv";
import {
  type ComputeInput,
  type ComputeResult,
  type Point,
  type WorkerOutMessage,
} from "@/lib/algorithm/types";
import { format, useI18n } from "@/lib/i18n";

type Status = "idle" | "computing" | "done" | "error";

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur sm:p-6">
      {children}
    </section>
  );
}

function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, "") || "drillplan";
}

function phaseProgress(phase: string, fraction: number): number {
  if (phase === "grid") return fraction * 0.15;
  if (phase === "kmeans") return 0.15 + fraction * 0.1;
  return 0.25 + fraction * 0.75;
}

export default function Home() {
  const { t } = useI18n();

  const [polygon, setPolygon] = useState<Point[] | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [counts, setCounts] = useState<number[]>([5, 3, 2, 4]);

  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [phaseLabel, setPhaseLabel] = useState<string>("");
  const [result, setResult] = useState<ComputeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const plotRef = useRef<SitePlotHandle>(null);

  const total = counts.reduce((a, b) => a + b, 0);

  const loadFile = useCallback(async (file: File) => {
    setError(null);
    setResult(null);
    setStatus("idle");
    try {
      const { polygon } = await parseAreaCsv(file);
      setPolygon(polygon);
      setFileName(file.name);
    } catch (err) {
      setPolygon(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const loadExample = useCallback(async () => {
    const res = await fetch("/sample.csv");
    const blob = await res.blob();
    await loadFile(new File([blob], "voorbeeld.csv", { type: "text/csv" }));
  }, [loadFile]);

  const runCompute = useCallback(() => {
    if (!polygon || total < 1) return;
    setStatus("computing");
    setError(null);
    setResult(null);
    setProgress(0);
    setPhaseLabel(t.phaseGrid);

    const worker = new Worker(
      new URL("../workers/compute.worker.ts", import.meta.url),
      { type: "module" },
    );
    const input: ComputeInput = { polygon, counts };

    worker.onmessage = (e: MessageEvent<WorkerOutMessage>) => {
      const msg = e.data;
      if (msg.type === "progress") {
        setProgress(phaseProgress(msg.phase, msg.fraction));
        setPhaseLabel(
          msg.phase === "grid"
            ? t.phaseGrid
            : msg.phase === "kmeans"
              ? t.phaseKmeans
              : t.phaseOptimize,
        );
      } else if (msg.type === "result") {
        setResult(msg.result);
        setStatus("done");
        worker.terminate();
      } else {
        setError(msg.message);
        setStatus("error");
        worker.terminate();
      }
    };
    worker.onerror = (e) => {
      setError(e.message || "Worker error");
      setStatus("error");
      worker.terminate();
    };
    worker.postMessage(input);
  }, [polygon, counts, total, t]);

  const handleDownloadCsv = useCallback(() => {
    if (!result) return;
    downloadFile(`${baseName(fileName)}_resultaat.csv`, placementsToCsv(result.placements));
  }, [result, fileName]);

  const handleDownloadImage = useCallback(() => {
    const url = plotRef.current?.toPng();
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${baseName(fileName)}_afbeelding.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [fileName]);

  const computing = status === "computing";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      {/* Header */}
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
              <circle cx="12" cy="12" r="2.4" fill="currentColor" />
              <circle cx="7" cy="8" r="1.4" fill="currentColor" opacity="0.6" />
              <circle cx="17" cy="9" r="1.4" fill="currentColor" opacity="0.6" />
              <circle cx="8.5" cy="16" r="1.4" fill="currentColor" opacity="0.6" />
            </svg>
          </span>
          <span className="text-xl font-bold tracking-tight text-slate-800">
            {t.appName}
          </span>
        </div>
        <LanguageToggle />
      </header>

      {/* Hero */}
      <div className="mb-8 max-w-3xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          {t.tagline}
        </h1>
        <p className="mt-3 text-slate-500">{t.intro}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* Left: inputs */}
        <div className="space-y-6">
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">{t.step1Title}</h2>
              {polygon && (
                <button
                  type="button"
                  onClick={() => {
                    setPolygon(null);
                    setResult(null);
                    setStatus("idle");
                  }}
                  className="text-sm font-medium text-slate-400 hover:text-slate-700"
                >
                  {t.changeFile}
                </button>
              )}
            </div>
            {polygon ? (
              <div className="flex items-center gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-emerald-800">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
                  <path
                    d="m5 13 4 4L19 7"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="text-sm">
                  <span className="font-semibold">{fileName}</span> ·{" "}
                  {format(t.areaLoaded, { n: polygon.length })}
                </span>
              </div>
            ) : (
              <FileUpload onFile={loadFile} onExample={loadExample} />
            )}
          </Card>

          <Card>
            <h2 className="mb-4 text-lg font-semibold text-slate-800">{t.step2Title}</h2>
            <MeasurementControls counts={counts} onChange={setCounts} />

            <div className="mt-5">
              {computing ? (
                <ProgressBar value={progress} label={phaseLabel} />
              ) : (
                <button
                  type="button"
                  onClick={runCompute}
                  disabled={!polygon || total < 1}
                  className="w-full rounded-xl bg-brand-600 px-5 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {status === "done" ? t.recompute : t.compute}
                </button>
              )}
              {total < 1 && polygon && (
                <p className="mt-2 text-center text-sm text-amber-600">
                  {t.needAtLeastOne}
                </p>
              )}
            </div>
          </Card>
        </div>

        {/* Right: visualization */}
        <div className="space-y-6">
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">{t.step3Title}</h2>
              {result && (
                <span className="rounded-full bg-brand-50 px-3 py-1 text-sm font-semibold text-brand-700">
                  {format(t.resultsReady, { n: result.placements.length })}
                </span>
              )}
            </div>

            {polygon ? (
              <SitePlot
                ref={plotRef}
                polygon={polygon}
                placements={result?.placements}
              />
            ) : (
              <div className="flex h-72 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-slate-400">
                {t.noArea}
              </div>
            )}

            {result && (
              <>
                <div className="mt-5">
                  <Legend placements={result.placements} />
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleDownloadCsv}
                    className="flex-1 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
                  >
                    {t.downloadCsv}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadImage}
                    className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    {t.downloadImage}
                  </button>
                </div>
              </>
            )}
          </Card>

          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">
              <h3 className="font-semibold">{t.errorTitle}</h3>
              <p className="mt-1 text-sm">{error}</p>
            </div>
          )}

          <Card>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
              {t.aboutTitle}
            </h3>
            <p className="text-sm leading-relaxed text-slate-500">{t.about}</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
