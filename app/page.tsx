"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AngleDial } from "@/components/AngleDial";
import { FileUpload } from "@/components/FileUpload";
import { Legend } from "@/components/Legend";
import { LanguageToggle } from "@/components/LanguageToggle";
import { MeasurementControls } from "@/components/MeasurementControls";
import { ProgressBar } from "@/components/ProgressBar";
import { SitePlot, type SitePlotHandle } from "@/components/SitePlot";
import { downloadFile, parseAreaCsv, placementsToCsv, polygonToCsv } from "@/lib/csv";
import { parseAreaShapefile } from "@/lib/shapefile";
import { generateExamplePolygon } from "@/lib/exampleArea";
import { optimizeRoute, orderNorthToSouth } from "@/lib/algorithm/route";
import {
  DEFAULT_DRILL_TYPES,
  DRILL_SYMBOLS,
  type ComputeInput,
  type ComputeResult,
  type DrillType,
  type Placement,
  type PlacementMode,
  type Point,
  type RouteOptions,
  type WorkerOutMessage,
} from "@/lib/algorithm/types";
import { format, useI18n } from "@/lib/i18n";

// "routing" replays just the route animation after a start/end/round-trip change.
type Status = "idle" | "computing" | "animating" | "routing" | "done" | "error";
type PickMode = "start" | "end" | null;

/** Fresh route: a round trip starting at the north-most hole, end chosen automatically. */
const DEFAULT_ROUTE_OPTIONS: RouteOptions = {
  startIndex: null,
  endIndex: null,
  roundTrip: true,
  numbering: "route",
};

/** Default hole counts, aligned with DEFAULT_DRILL_TYPES. */
const DEFAULT_COUNTS = [5, 5, 5, 5, 5, 3];

const DRILLS_STORAGE_KEY = "drillplan-drills";

/** Parse a stored drill-types list, keeping only well-formed entries. Returns null if unusable. */
function parseStoredDrillTypes(raw: string | null): DrillType[] | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return null;
    const types: DrillType[] = [];
    for (const d of data) {
      if (
        d &&
        typeof d.id === "string" &&
        typeof d.code === "string" &&
        typeof d.color === "string" &&
        DRILL_SYMBOLS.includes(d.symbol)
      ) {
        types.push({ id: d.id, code: d.code, color: d.color, symbol: d.symbol });
      }
    }
    return types.length ? types : null;
  } catch {
    return null;
  }
}

/** Resize `counts` to `len`, keeping existing values and padding new slots with 0. */
function fitCounts(counts: number[], len: number): number[] {
  return Array.from({ length: len }, (_, i) => counts[i] ?? 0);
}

let drillIdCounter = 0;
function newDrillId(): string {
  return `drill-${Date.now().toString(36)}-${drillIdCounter++}`;
}

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

/** Tiny preview of each placement layout: an organic scatter vs a (slightly angled) raster. */
function LayoutIcon({ mode }: { mode: PlacementMode }) {
  if (mode === "grid") {
    const cells = [6, 13, 20];
    return (
      <svg width="24" height="24" viewBox="0 0 26 26" fill="none" aria-hidden>
        <g transform="rotate(12 13 13)">
          {cells.flatMap((x) =>
            cells.map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.7" fill="currentColor" />),
          )}
        </g>
      </svg>
    );
  }
  const pts = [
    [6, 8], [13, 5], [20, 9], [8, 17], [16, 19], [22, 14],
  ];
  return (
    <svg width="24" height="24" viewBox="0 0 26 26" fill="none" aria-hidden>
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.7" fill="currentColor" />
      ))}
    </svg>
  );
}

/** Pill-button styling for the route controls, mirroring the Legend pills. */
function routePill(active: boolean, disabled = false): string {
  return `inline-flex items-center gap-1.5 rounded-full border px-[11px] py-1 font-mono text-xs font-semibold transition ${
    active
      ? "border-clay bg-clay-soft-bg text-clay"
      : "border-hairline-2 bg-surface text-ink-2"
  } ${disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer hover:text-ink"}`;
}

export default function Home() {
  const { t } = useI18n();

  const [polygon, setPolygon] = useState<Point[] | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [drillTypes, setDrillTypes] = useState<DrillType[]>(DEFAULT_DRILL_TYPES);
  const [counts, setCounts] = useState<number[]>(DEFAULT_COUNTS);

  // Hydrate the persisted drill types after mount. The first render uses the built-in
  // defaults so server and client markup match; reading localStorage during lazy init would
  // touch `window` on the server and break SSR. Reconcile the counts length to the stored
  // list. The one-time setState here is intentional, hence the rule suppression.
  useEffect(() => {
    const stored = parseStoredDrillTypes(window.localStorage.getItem(DRILLS_STORAGE_KEY));
    if (!stored) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setDrillTypes(stored);
    setCounts((c) => fitCounts(c, stored.length));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const persistDrillTypes = useCallback((types: DrillType[]) => {
    window.localStorage.setItem(DRILLS_STORAGE_KEY, JSON.stringify(types));
  }, []);

  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<ComputeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [highlightedType, setHighlightedType] = useState<number | null>(null);
  const [routeOptions, setRouteOptions] = useState<RouteOptions>(DEFAULT_ROUTE_OPTIONS);
  const [pickMode, setPickMode] = useState<PickMode>(null);
  // How the next compute distributes holes: evenly-spread (k-means) or a regular raster.
  const [mode, setMode] = useState<PlacementMode>("kmeans");
  // Whether the drilling route path (lines/numbers/endpoints) is drawn over the holes.
  const [showPath, setShowPath] = useState(true);
  // Grid mode: user-fixed raster angle (radians), or null to auto-pick the best angle.
  const [gridAngle, setGridAngle] = useState<number | null>(null);
  // True while a quiet angle-adjust recompute is in flight (keeps the current view on screen).
  const [adjusting, setAdjusting] = useState(false);
  const angleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const plotRef = useRef<SitePlotHandle>(null);

  const total = counts.reduce((a, b) => a + b, 0);

  // Order the holes into the shortest drilling route (Traveling Salesman). Cheap for these
  // hole counts, so it re-runs on the client whenever the start/end/round-trip changes —
  // no need to re-run the k-means worker.
  const routed = useMemo(() => {
    if (!result) return null;
    return routeOptions.numbering === "northSouth"
      ? orderNorthToSouth(result.placements)
      : optimizeRoute(result.placements, routeOptions);
  }, [result, routeOptions]);
  const routedPlacements = routed?.placements;

  const spread = useMemo(
    () => (result ? minSameTypeDistance(result.placements) : null),
    [result],
  );

  const loadFiles = useCallback(async (files: File[]) => {
    setError(null);
    setResult(null);
    setStatus("idle");
    setHighlightedType(null);
    setRouteOptions(DEFAULT_ROUTE_OPTIONS);
    setPickMode(null);
    setGridAngle(null);
    // A shapefile arrives as several sibling files; the .shp carries the geometry.
    // A CSV arrives on its own. Pick the source file by extension.
    const shp = files.find((f) => f.name.toLowerCase().endsWith(".shp"));
    const csv = files.find((f) => f.name.toLowerCase().endsWith(".csv"));
    const source = shp ?? csv ?? (files.length === 1 ? files[0] : undefined);
    try {
      if (!source) {
        throw new Error("Upload a CSV, or a shapefile's .shp file.");
      }
      const { polygon } = shp
        ? await parseAreaShapefile(shp)
        : await parseAreaCsv(source);
      setPolygon(polygon);
      setFileName(source.name);
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
    setRouteOptions(DEFAULT_ROUTE_OPTIONS);
    setPickMode(null);
    setGridAngle(null);
    setPolygon(generateExamplePolygon());
    setFileName("example-site.csv");
  }, []);

  // Switch the placement layout; reset any manual raster angle so a fresh layout auto-fits.
  const handleSetMode = useCallback((m: PlacementMode) => {
    setMode(m);
    setGridAngle(null);
  }, []);

  const handleDownloadExample = useCallback(() => {
    downloadFile("drillplan-example.csv", polygonToCsv(generateExamplePolygon()));
  }, []);

  // Run the compute worker for `input`. A "quiet" run (a live angle tweak) swaps the result in
  // place and lands on "done" without replaying the reveal animation; a normal run animates.
  const runWorker = useCallback((input: ComputeInput, quiet: boolean) => {
    const worker = new Worker(
      new URL("../workers/compute.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.onmessage = (e: MessageEvent<WorkerOutMessage>) => {
      const msg = e.data;
      if (msg.type === "result") {
        setResult(msg.result);
        setStatus(quiet ? "done" : msg.result.animation ? "animating" : "done");
        setAdjusting(false);
        worker.terminate();
      } else if (msg.type === "error") {
        setError(msg.message);
        setStatus("error");
        setAdjusting(false);
        worker.terminate();
      }
      // "progress" messages are ignored — the busy indicator is indeterminate.
    };
    worker.onerror = (e) => {
      setError(e.message || "Worker error");
      setStatus("error");
      setAdjusting(false);
      worker.terminate();
    };
    worker.postMessage(input);
  }, []);

  const runCompute = useCallback(() => {
    if (!polygon || total < 1) return;
    setStatus("computing");
    setError(null);
    setResult(null);
    setHighlightedType(null);
    setRouteOptions(DEFAULT_ROUTE_OPTIONS);
    setPickMode(null);
    setAdjusting(false);
    if (angleTimer.current) clearTimeout(angleTimer.current); // drop any pending angle tweak
    runWorker(
      { polygon, counts, mode, angleOverride: mode === "grid" ? gridAngle : null, captureAnimation: true },
      false,
    );
  }, [polygon, counts, total, mode, gridAngle, runWorker]);

  // Turn the raster: update the dial immediately, then (debounced) quietly recompute the grid
  // at the new angle. `next === null` returns to the auto-picked best angle.
  const handleAngleChange = useCallback(
    (next: number | null) => {
      setGridAngle(next);
      if (!polygon || total < 1) return;
      setAdjusting(true);
      if (angleTimer.current) clearTimeout(angleTimer.current);
      angleTimer.current = setTimeout(() => {
        runWorker(
          { polygon, counts, mode: "grid", angleOverride: next, captureAnimation: true },
          true,
        );
      }, 140);
    },
    [polygon, counts, total, runWorker],
  );

  const handleDownloadCsv = useCallback(() => {
    if (!routedPlacements) return;
    downloadFile(
      `${baseName(fileName)}_result.csv`,
      placementsToCsv(routedPlacements, drillTypes),
    );
  }, [routedPlacements, drillTypes, fileName]);

  // Add a drill type (with a count of 0). Existing type indices are unchanged, so any current
  // result stays valid — no recompute needed until the user gives it a count.
  const addDrillType = useCallback(() => {
    // Distinct categorical hues (matching the default types, extended with magenta/orange)
    // so an added type is clearly separable from the others rather than a near-duplicate.
    const palette = [
      "#2a6fd0", "#2e8b3d", "#b7791d", "#c0392b", "#7b3ff2", "#0d9488", "#d1478b", "#e0722c",
    ];
    setDrillTypes((types) => {
      const next: DrillType[] = [
        ...types,
        {
          id: newDrillId(),
          code: `bo${String(types.length + 1).padStart(2, "0")}`,
          color: palette[types.length % palette.length],
          symbol: "circle",
        },
      ];
      persistDrillTypes(next);
      return next;
    });
    setCounts((c) => [...c, 0]);
  }, [persistDrillTypes]);

  // Delete a drill type. This shifts the remaining indices, so a stale result would mislabel
  // holes — clear it and reset the route, mirroring the "Change file" reset.
  const deleteDrillType = useCallback((index: number) => {
    setDrillTypes((types) => {
      if (types.length <= 1) return types;
      const next = types.filter((_, i) => i !== index);
      persistDrillTypes(next);
      return next;
    });
    setCounts((c) => c.filter((_, i) => i !== index));
    setResult(null);
    setStatus("idle");
    setError(null);
    setHighlightedType(null);
    setRouteOptions(DEFAULT_ROUTE_OPTIONS);
    setPickMode(null);
    setGridAngle(null);
  }, [persistDrillTypes]);

  // Edit a drill type's appearance (name/color/symbol). The index is unchanged, so the current
  // result stays valid and simply re-renders with the new look.
  const editDrillType = useCallback((index: number, patch: Partial<DrillType>) => {
    setDrillTypes((types) => {
      const next = types.map((tp, i) => (i === index ? { ...tp, ...patch } : tp));
      persistDrillTypes(next);
      return next;
    });
  }, [persistDrillTypes]);

  const handleAnimationDone = useCallback(() => setStatus("done"), []);

  const handleReplay = useCallback(() => {
    if (result?.animation) {
      setHighlightedType(null);
      setPickMode(null);
      setStatus("animating");
    }
  }, [result]);

  // Replay the route-only animation so a re-optimization is always visible. Guarded so it
  // only fires once there is a result on screen, and skipped when the path is hidden (there
  // is nothing to animate — the routed order still updates the export and static view).
  const replayRoute = useCallback(() => {
    if (!showPath) return;
    setStatus((s) => (s === "done" || s === "routing" ? "routing" : s));
  }, [showPath]);

  // Map a clicked hole (routed index) back to its stable original index, then set it as the
  // route's start or end. The route re-optimizes instantly via the `routed` memo.
  const handlePickPoint = useCallback(
    (routedIndex: number) => {
      setRouteOptions((opts) => {
        if (!routed || !pickMode) return opts;
        const originalIndex = routed.order[routedIndex];
        return pickMode === "start"
          ? { ...opts, startIndex: originalIndex }
          : { ...opts, endIndex: originalIndex };
      });
      setPickMode(null);
      replayRoute();
    },
    [routed, pickMode, replayRoute],
  );

  const toggleRoundTrip = useCallback(() => {
    setRouteOptions((opts) => ({ ...opts, roundTrip: !opts.roundTrip }));
    setPickMode((m) => (m === "end" ? null : m)); // "end" is meaningless on a round trip
    replayRoute();
  }, [replayRoute]);

  const resetRoute = useCallback(() => {
    setRouteOptions((opts) => ({ ...opts, startIndex: null, endIndex: null }));
    setPickMode(null);
    replayRoute();
  }, [replayRoute]);

  const setNumbering = useCallback(
    (numbering: RouteOptions["numbering"]) => {
      setRouteOptions((opts) => (opts.numbering === numbering ? opts : { ...opts, numbering }));
      setPickMode(null); // start/end picking is meaningless in north→south mode
      replayRoute();
    },
    [replayRoute],
  );

  const startArmed = pickMode === "start";
  const endArmed = pickMode === "end";
  const armStart = useCallback(() => setPickMode((m) => (m === "start" ? null : "start")), []);
  const armEnd = useCallback(() => setPickMode((m) => (m === "end" ? null : "end")), []);

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
            <circle cx="13" cy="17" r="2.5" fill="#2a6fd0" />
            <circle cx="27" cy="13" r="2.5" fill="#b7791d" />
            <circle cx="20.5" cy="23" r="2.5" fill="#c0392b" />
            <circle cx="14" cy="28" r="2.5" fill="#0d9488" />
            <circle cx="30" cy="25" r="2.5" fill="#7b3ff2" />
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
                    setRouteOptions(DEFAULT_ROUTE_OPTIONS);
                    setPickMode(null);
                    setGridAngle(null);
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
                onFiles={loadFiles}
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
            <MeasurementControls
              drillTypes={drillTypes}
              counts={counts}
              onCountsChange={setCounts}
              onAddType={addDrillType}
              onDeleteType={deleteDrillType}
              onEditType={editDrillType}
            />

            {/* Placement layout — how the holes are distributed, chosen before computing. */}
            <div className="mt-[18px]">
              <span className="mb-2 block font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-4">
                {t.layoutLabel}
              </span>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { m: "kmeans" as const, label: t.layoutOptimized, hint: t.layoutOptimizedHint },
                    { m: "grid" as const, label: t.layoutGrid, hint: t.layoutGridHint },
                  ]
                ).map(({ m, label, hint }) => {
                  const active = mode === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={active}
                      onClick={() => handleSetMode(m)}
                      className={`flex flex-col gap-1.5 rounded-[11px] border p-3 text-left transition ${
                        active
                          ? "border-clay bg-clay-soft-bg"
                          : "border-hairline-2 bg-surface-inset hover:border-clay-soft-border"
                      }`}
                    >
                      <span className={active ? "text-clay" : "text-ink-3"}>
                        <LayoutIcon mode={m} />
                      </span>
                      <span className="text-[13px] font-semibold text-ink">{label}</span>
                      <span className="text-[11.5px] leading-[1.4] text-ink-3">{hint}</span>
                    </button>
                  );
                })}
              </div>
            </div>

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
                  {status === "done" || status === "animating" || status === "routing"
                    ? t.recompute
                    : t.compute}
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
            <div className="mb-[15px] flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5">
              <div className="flex items-center gap-2.5">
                <StepBadge>03</StepBadge>
                <CardTitle>{t.step3Title}</CardTitle>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
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
              placements={routedPlacements}
              drillTypes={drillTypes}
              animation={result?.animation ?? null}
              animate={
                status === "animating" ? "full" : status === "routing" ? "route" : false
              }
              onAnimationDone={handleAnimationDone}
              highlightType={highlightedType}
              route={routed}
              showPath={showPath}
              pickMode={status === "done" || status === "routing" ? pickMode : null}
              onPickPoint={handlePickPoint}
            />

            {(status === "done" || status === "routing") && result && routed && (
              <>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5">
                  <Legend
                    drillTypes={drillTypes}
                    placements={routed.placements}
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

                {/* Raster angle compass — grid layout only. Turn it to rotate the raster. */}
                {mode === "grid" && result.grid && (
                  <div className="mt-3 flex items-center gap-3.5 rounded-[11px] border border-hairline-2 bg-surface-inset px-[15px] py-3">
                    <AngleDial
                      angle={gridAngle ?? result.grid.angle}
                      onChange={handleAngleChange}
                      title={t.gridAngleLabel}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-4">
                          {t.gridAngleLabel}
                        </span>
                        <span className="font-mono text-[15px] font-semibold text-ink">
                          {Math.round((((gridAngle ?? result.grid.angle) * 180) / Math.PI) % 90)}°
                        </span>
                        <button
                          type="button"
                          aria-pressed={gridAngle == null}
                          onClick={() => handleAngleChange(null)}
                          className={`inline-flex cursor-pointer items-center rounded-full border px-[11px] py-1 font-mono text-xs font-semibold transition ${
                            gridAngle == null
                              ? "border-clay bg-clay-soft-bg text-clay"
                              : "border-hairline-2 bg-surface text-ink-2 hover:text-ink"
                          }`}
                        >
                          {t.autoLabel}
                        </button>
                        {adjusting && (
                          <span className="font-mono text-[11px] text-clay">{t.optimizing}</span>
                        )}
                      </div>
                      <p className="mt-1 text-[11.5px] leading-[1.4] text-ink-3">{t.gridAngleHint}</p>
                    </div>
                  </div>
                )}

                {/* Drilling route (Traveling Salesman) controls */}
                <div className="mt-3 rounded-[11px] border border-hairline-2 bg-surface-inset px-[15px] py-[13px]">
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-4">
                        {t.routeTitle}
                      </span>
                      <span
                        className={`font-mono text-[13px] font-semibold text-ink transition ${
                          showPath ? "" : "opacity-40"
                        }`}
                      >
                        {`${Math.round(routed.length).toLocaleString()} m`}
                      </span>
                      {status === "routing" && showPath && (
                        <span className="font-mono text-[11px] text-clay">{t.optimizing}</span>
                      )}
                      {/* Show / hide the route path (lines, numbers, endpoints) on the map. */}
                      <button
                        type="button"
                        role="switch"
                        aria-checked={showPath}
                        onClick={() => setShowPath((v) => !v)}
                        className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-hairline-2 bg-surface px-2.5 py-1 transition hover:border-clay-soft-border"
                      >
                        <span
                          className={`relative h-[16px] w-[28px] rounded-full transition-colors ${
                            showPath ? "bg-clay" : "bg-divider"
                          }`}
                        >
                          <span
                            className={`absolute top-[2px] h-[12px] w-[12px] rounded-full bg-white transition-all ${
                              showPath ? "left-[14px]" : "left-[2px]"
                            }`}
                          />
                        </span>
                        <span className="font-mono text-xs font-semibold text-ink-2">
                          {t.showPathLabel}
                        </span>
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Numbering mode: shortest route (TSP) vs strictly north→south */}
                      <div className="inline-flex items-center gap-2">
                        <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-4">
                          {t.numberingLabel}
                        </span>
                        <div className="inline-flex rounded-full border border-hairline-2 bg-surface p-0.5">
                          {(["route", "northSouth"] as const).map((mode) => {
                            const active = routeOptions.numbering === mode;
                            return (
                              <button
                                key={mode}
                                type="button"
                                aria-pressed={active}
                                onClick={() => setNumbering(mode)}
                                className={`cursor-pointer rounded-full px-[11px] py-[3px] font-mono text-xs font-semibold transition ${
                                  active ? "bg-clay text-clay-on" : "text-ink-2 hover:text-ink"
                                }`}
                              >
                                {mode === "route" ? t.numberByRoute : t.numberNorthSouth}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Round-trip / start / end / reset — shortest-route numbering only */}
                      {routeOptions.numbering === "route" && (
                      <>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={routeOptions.roundTrip}
                        onClick={toggleRoundTrip}
                        className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-hairline-2 bg-surface px-2.5 py-1 transition hover:border-clay-soft-border"
                      >
                        <span
                          className={`relative h-[16px] w-[28px] rounded-full transition-colors ${
                            routeOptions.roundTrip ? "bg-clay" : "bg-divider"
                          }`}
                        >
                          <span
                            className={`absolute top-[2px] h-[12px] w-[12px] rounded-full bg-white transition-all ${
                              routeOptions.roundTrip ? "left-[14px]" : "left-[2px]"
                            }`}
                          />
                        </span>
                        <span className="font-mono text-xs font-semibold text-ink-2">
                          {t.roundTrip}
                        </span>
                      </button>

                      {/* Start chip */}
                      <button
                        type="button"
                        aria-pressed={startArmed}
                        onClick={armStart}
                        className={routePill(startArmed)}
                      >
                        <span
                          className="h-[7px] w-[7px] rounded-full"
                          style={{ background: "#bd5a2e" }}
                        />
                        {t.startLabel}:{" "}
                        {routeOptions.startIndex == null ? t.startAuto : t.custom}
                      </button>

                      {/* End chip — one-way only */}
                      {!routeOptions.roundTrip && (
                        <button
                          type="button"
                          aria-pressed={endArmed}
                          onClick={armEnd}
                          className={routePill(endArmed)}
                        >
                          <span
                            className="h-[7px] w-[7px] rounded-full"
                            style={{ background: "#2f6b73" }}
                          />
                          {t.endLabel}:{" "}
                          {routeOptions.endIndex == null ? t.endAuto : t.custom}
                        </button>
                      )}

                      {(routeOptions.startIndex != null ||
                        (!routeOptions.roundTrip && routeOptions.endIndex != null)) && (
                        <button
                          type="button"
                          onClick={resetRoute}
                          className="cursor-pointer px-1 font-mono text-xs font-semibold text-ink-3 transition hover:text-ink"
                        >
                          {t.resetRoute}
                        </button>
                      )}
                      </>
                      )}
                    </div>
                  </div>
                  {pickMode && (
                    <p className="mt-2.5 font-mono text-[12px] text-clay">{t.pickHint}</p>
                  )}
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
