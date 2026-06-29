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

export interface TypeStrings {
  label: string;
  description: string;
}

export interface Dict {
  appName: string;
  tagline: string;
  intro: string;

  step1Title: string;
  step2Title: string;
  step3Title: string;

  dropHere: string;
  dropHint: string;
  browse: string;
  tryExample: string;
  fileNeeds: string;
  areaLoaded: string; // "{n} points loaded"
  noArea: string;
  changeFile: string;

  countsHint: string;
  totalHoles: string; // "{n} holes total"
  needAtLeastOne: string;

  compute: string;
  recompute: string;
  computing: string;
  phaseGrid: string;
  phaseKmeans: string;
  phaseOptimize: string;

  resultsReady: string; // "{n} holes placed"
  spreadScore: string;
  downloadCsv: string;
  downloadImage: string;
  legend: string;
  perType: string;

  tipId: string;
  tipType: string;

  errorTitle: string;

  types: Record<string, TypeStrings>;

  aboutTitle: string;
  about: string;
}

const nl: Dict = {
  appName: "DrillPlan",
  tagline: "Boorlocaties slim verdeeld over een terrein",
  intro:
    "Upload de omtrek van een terrein, kies hoeveel boringen en peilbuizen je wilt, en DrillPlan verdeelt ze gelijkmatig over het gebied — gelijke metingen zo ver mogelijk uit elkaar, en nooit twee metingen op dezelfde plek.",

  step1Title: "1. Terrein uploaden",
  step2Title: "2. Metingen kiezen",
  step3Title: "3. Resultaat",

  dropHere: "Sleep je CSV-bestand hierheen",
  dropHint: "of",
  browse: "Bestand kiezen",
  tryExample: "Probeer een voorbeeld",
  fileNeeds: 'Het bestand moet kolommen "Position X" en "Position Y" bevatten.',
  areaLoaded: "{n} punten geladen",
  noArea: "Nog geen terrein geladen.",
  changeFile: "Ander bestand",

  countsHint: "Kies per type hoeveel locaties je nodig hebt.",
  totalHoles: "{n} locaties in totaal",
  needAtLeastOne: "Kies minstens één locatie.",

  compute: "Berekenen",
  recompute: "Opnieuw berekenen",
  computing: "Bezig met berekenen…",
  phaseGrid: "Gebied verkennen…",
  phaseKmeans: "Locaties verdelen…",
  phaseOptimize: "Plaatsing optimaliseren…",

  resultsReady: "{n} locaties geplaatst",
  spreadScore: "Spreidingsscore",
  downloadCsv: "Download CSV",
  downloadImage: "Download afbeelding",
  legend: "Legenda",
  perType: "Per type",

  tipId: "Nr.",
  tipType: "Type",

  errorTitle: "Er ging iets mis",

  types: {
    BOR05: { label: "BOR05", description: "Boring tot 5 m" },
    BOR10: { label: "BOR10", description: "Boring tot 10 m" },
    BOR20: { label: "BOR20", description: "Boring tot 20 m" },
    PB: { label: "PB", description: "Peilbuis" },
  },

  aboutTitle: "Hoe werkt het?",
  about:
    "DrillPlan legt een raster over het terrein, kiest gelijkmatig verdeelde locaties (K-Means) en zoekt de verdeling waarbij metingen van hetzelfde type zo ver mogelijk uit elkaar liggen. Alles gebeurt in je browser — je bestand wordt nergens geüpload.",
};

const en: Dict = {
  appName: "DrillPlan",
  tagline: "Smartly spread drilling locations across a site",
  intro:
    "Upload a site outline, choose how many borings and monitoring wells you need, and DrillPlan spreads them evenly across the area — same-type measurements as far apart as possible, and never two measurements in the same spot.",

  step1Title: "1. Upload the site",
  step2Title: "2. Choose measurements",
  step3Title: "3. Result",

  dropHere: "Drop your CSV file here",
  dropHint: "or",
  browse: "Choose a file",
  tryExample: "Try an example",
  fileNeeds: 'The file must contain "Position X" and "Position Y" columns.',
  areaLoaded: "{n} points loaded",
  noArea: "No site loaded yet.",
  changeFile: "Change file",

  countsHint: "Choose how many locations you need per type.",
  totalHoles: "{n} locations total",
  needAtLeastOne: "Choose at least one location.",

  compute: "Calculate",
  recompute: "Recalculate",
  computing: "Calculating…",
  phaseGrid: "Scanning the area…",
  phaseKmeans: "Spreading locations…",
  phaseOptimize: "Optimizing placement…",

  resultsReady: "{n} locations placed",
  spreadScore: "Spread score",
  downloadCsv: "Download CSV",
  downloadImage: "Download image",
  legend: "Legend",
  perType: "Per type",

  tipId: "No.",
  tipType: "Type",

  errorTitle: "Something went wrong",

  types: {
    BOR05: { label: "BOR05", description: "Boring (5 m deep)" },
    BOR10: { label: "BOR10", description: "Boring (10 m deep)" },
    BOR20: { label: "BOR20", description: "Boring (20 m deep)" },
    PB: { label: "PB", description: "Monitoring well" },
  },

  aboutTitle: "How does it work?",
  about:
    "DrillPlan lays a grid over the site, picks evenly spread locations (K-Means), and searches for the arrangement where same-type measurements are as far apart as possible. Everything runs in your browser — your file is never uploaded anywhere.",
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
    const stored = window.localStorage.getItem(STORAGE_KEY);
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
