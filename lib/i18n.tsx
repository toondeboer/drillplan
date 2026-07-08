"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Language = "nl" | "en";

export interface Dict {
  appName: string;
  privacy: string;
  tagline: string;
  intro: string;

  step1Title: string;
  step2Title: string;
  step3Title: string;

  dropHere: string;
  dropHint: string;
  browse: string;
  tryExample: string;
  downloadExample: string;
  fileNeeds: string;
  vertexLabel: string; // "{n} vertices loaded"
  noArea: string;
  noAreaHint: string;
  changeFile: string;

  countsHint: string;
  totalLabelText: string;
  needAtLeastOne: string;
  addDrill: string;
  deleteDrill: string;
  editDrill: string;
  drillNameLabel: string;
  drillColorLabel: string;
  drillSymbolLabel: string;

  layoutLabel: string;
  layoutOptimized: string;
  layoutGrid: string;
  layoutOptimizedHint: string;
  layoutGridHint: string;
  gridAngleLabel: string;
  autoLabel: string;
  gridAngleHint: string;

  compute: string;
  recompute: string;
  computing: string;

  resultChip: string; // "{n} placed"
  spreadScore: string;
  downloadCsv: string;
  downloadImage: string;
  skipAnimation: string;
  replayAnimation: string;

  routeTitle: string;
  showPathLabel: string;
  roundTrip: string;
  startLabel: string;
  endLabel: string;
  startAuto: string;
  endAuto: string;
  custom: string;
  optimizing: string;
  resetRoute: string;
  pickHint: string;
  numberingLabel: string;
  numberByRoute: string;
  numberNorthSouth: string;

  tipId: string;

  errorTitle: string;

  aboutTitle: string;
  about: string;
}

const nl: Dict = {
  appName: "DrillPlan",
  privacy: "Draait in je browser",
  tagline: "Boorlocaties, gelijkmatig verdeeld over je terrein.",
  intro:
    "Upload de omtrek van een terrein, kies hoeveel boringen en peilbuizen je wilt, en DrillPlan verdeelt ze over het gebied — gelijke metingen zo ver mogelijk uit elkaar, en nooit twee op dezelfde plek.",

  step1Title: "Terrein uploaden",
  step2Title: "Metingen kiezen",
  step3Title: "Terreinkaart",

  dropHere: "Sleep je terreinomtrek hierheen",
  dropHint: "sleep een CSV of shapefile hierheen, of",
  browse: "Bestand kiezen",
  tryExample: "Probeer een voorbeeld",
  downloadExample: "Voorbeeld-CSV downloaden",
  fileNeeds:
    'CSV met kolommen "Position X" en "Position Y", of een QGIS-shapefile (.shp, .shx, .dbf, .prj …).',
  vertexLabel: "{n} hoekpunten geladen",
  noArea: "Geen terrein geladen",
  noAreaHint: "Upload een CSV- of shapefile-omtrek om het gebied te tekenen.",
  changeFile: "Ander bestand",

  countsHint: "Kies per type hoeveel locaties je nodig hebt.",
  totalLabelText: "Totaal aantal locaties",
  needAtLeastOne: "Kies minstens één locatie.",
  addDrill: "Boortype toevoegen",
  deleteDrill: "Boortype verwijderen",
  editDrill: "Kleur en symbool wijzigen",
  drillNameLabel: "Naam",
  drillColorLabel: "Kleur",
  drillSymbolLabel: "Symbool",

  layoutLabel: "Verdeling",
  layoutOptimized: "Optimaal",
  layoutGrid: "Raster",
  layoutOptimizedHint: "Gelijkmatig gespreid, organisch verdeeld over het terrein.",
  layoutGridHint: "Regelmatig raster — gelijke afstand, haakse rijen (evt. onder een hoek).",
  gridAngleLabel: "Rasterhoek",
  autoLabel: "Auto",
  gridAngleHint: "Draai het kompas of typ een hoek om het raster te kantelen.",

  compute: "Plaatsing berekenen",
  recompute: "Opnieuw berekenen",
  computing: "Plaatsing optimaliseren…",

  resultChip: "{n} geplaatst",
  spreadScore: "Spreiding",
  downloadCsv: "Download CSV",
  downloadImage: "Download afbeelding",
  skipAnimation: "Overslaan",
  replayAnimation: "Opnieuw afspelen",

  routeTitle: "Route",
  showPathLabel: "Route-lijn",
  roundTrip: "Rondrit",
  startLabel: "Start",
  endLabel: "Eind",
  startAuto: "noordelijkste",
  endAuto: "auto",
  custom: "handmatig",
  optimizing: "optimaliseren…",
  resetRoute: "Herstellen",
  pickHint: "Klik op een boorpunt op de kaart om het te kiezen.",
  numberingLabel: "Nummering",
  numberByRoute: "Route",
  numberNorthSouth: "Noord→Zuid",

  tipId: "Nr.",

  errorTitle: "Er ging iets mis",

  aboutTitle: "Hoe werkt het",
  about:
    "DrillPlan verdeelt de locaties op twee manieren: 'Optimaal' kiest gelijkmatig gespreide punten met K-Means, en 'Raster' legt een regelmatig, haaks raster (eventueel onder een hoek) over het terrein en boort op elk snijpunt binnen de omtrek. Daarna zoekt het de verdeling waarbij metingen van hetzelfde type zo ver mogelijk uit elkaar liggen, en zet het de boringen in de kortste boorroute (het handelsreizigersprobleem, opgelost met nearest-neighbor + 2-opt). Alles gebeurt lokaal — je bestand wordt nergens geüpload.",
};

const en: Dict = {
  appName: "DrillPlan",
  privacy: "Runs in your browser",
  tagline: "Drilling locations, evenly spread across any site.",
  intro:
    "Upload a site outline, set how many borings and monitoring wells you need, and DrillPlan distributes them across the area — same-type measurements pushed as far apart as possible, and never two in the same spot.",

  step1Title: "Upload the site",
  step2Title: "Choose measurements",
  step3Title: "Site map",

  dropHere: "Drop your site outline",
  dropHint: "drag a CSV or shapefile here, or",
  browse: "Choose a file",
  tryExample: "Try an example",
  downloadExample: "Download example CSV",
  fileNeeds:
    'A CSV with "Position X" and "Position Y" columns, or a QGIS shapefile (.shp, .shx, .dbf, .prj …).',
  vertexLabel: "{n} vertices loaded",
  noArea: "No site loaded",
  noAreaHint: "Upload a CSV or shapefile outline to draw the survey area.",
  changeFile: "Change file",

  countsHint: "Set how many locations you need per type.",
  totalLabelText: "Total locations",
  needAtLeastOne: "Choose at least one location.",
  addDrill: "Add drill type",
  deleteDrill: "Remove drill type",
  editDrill: "Edit color and symbol",
  drillNameLabel: "Name",
  drillColorLabel: "Color",
  drillSymbolLabel: "Symbol",

  layoutLabel: "Layout",
  layoutOptimized: "Optimized",
  layoutGrid: "Grid",
  layoutOptimizedHint: "Evenly spread, organically distributed across the site.",
  layoutGridHint: "Regular raster — equal spacing, perpendicular rows (optionally angled).",
  gridAngleLabel: "Grid angle",
  autoLabel: "Auto",
  gridAngleHint: "Turn the compass or type an angle to rotate the raster.",

  compute: "Calculate placement",
  recompute: "Recalculate",
  computing: "Optimizing placement…",

  resultChip: "{n} placed",
  spreadScore: "Spread",
  downloadCsv: "Download CSV",
  downloadImage: "Download image",
  skipAnimation: "Skip",
  replayAnimation: "Replay",

  routeTitle: "Route",
  showPathLabel: "Path",
  roundTrip: "Round trip",
  startLabel: "Start",
  endLabel: "End",
  startAuto: "north-most",
  endAuto: "auto",
  custom: "custom",
  optimizing: "optimizing…",
  resetRoute: "Reset",
  pickHint: "Click a hole on the map to set it.",
  numberingLabel: "Numbering",
  numberByRoute: "Route",
  numberNorthSouth: "North→South",

  tipId: "No.",

  errorTitle: "Something went wrong",

  aboutTitle: "How it works",
  about:
    "DrillPlan places locations two ways: 'Optimized' picks evenly spread points with K-Means, while 'Grid' fits a regular, perpendicular raster (optionally angled) to the site and drills at every intersection inside the outline. It then searches type assignments so same-type measurements sit as far apart as possible, and orders the holes into the shortest drilling route (the Traveling Salesman problem, solved with nearest-neighbor + 2-opt) so the CSV can be drilled top-to-bottom. Everything runs locally — your file is never uploaded.",
};

const dictionaries: Record<Language, Dict> = { nl, en };

interface I18nContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
  t: Dict;
}

const I18nContext = createContext<I18nContextValue | null>(null);

const STORAGE_KEY = "drillplan-lang";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>("nl");

  useEffect(() => {
    // Hydrate the persisted language after mount. The initial render must use
    // the "nl" default so server and client markup match; reading localStorage
    // during lazy init would touch `window` on the server and break SSR. The
    // one-time setState here is intentional, hence the rule suppression.
    const stored = window.localStorage.getItem(STORAGE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored === "nl" || stored === "en") setLangState(stored);
  }, []);

  const setLang = useCallback((next: Language) => {
    setLangState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.lang = next;
  }, []);

  const value = useMemo(
    () => ({ lang, setLang, t: dictionaries[lang] }),
    [lang, setLang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within an I18nProvider");
  return ctx;
}

/** Simple {n}-style interpolation helper. */
export function format(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ""));
}
