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

  compute: string;
  recompute: string;
  computing: string;

  resultChip: string; // "{n} placed"
  spreadScore: string;
  downloadCsv: string;
  downloadImage: string;
  skipAnimation: string;
  replayAnimation: string;

  tipId: string;

  errorTitle: string;

  /** Per-type description, keyed by measurement code. */
  types: Record<string, string>;

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
  dropHint: "sleep een CSV hierheen, of",
  browse: "Bestand kiezen",
  tryExample: "Probeer een voorbeeld",
  downloadExample: "Voorbeeld-CSV downloaden",
  fileNeeds: 'Vereist kolommen "Position X" en "Position Y".',
  vertexLabel: "{n} hoekpunten geladen",
  noArea: "Geen terrein geladen",
  noAreaHint: "Upload een CSV-omtrek om het gebied te tekenen.",
  changeFile: "Ander bestand",

  countsHint: "Kies per type hoeveel locaties je nodig hebt.",
  totalLabelText: "Totaal aantal locaties",
  needAtLeastOne: "Kies minstens één locatie.",

  compute: "Plaatsing berekenen",
  recompute: "Opnieuw berekenen",
  computing: "Plaatsing optimaliseren…",

  resultChip: "{n} geplaatst",
  spreadScore: "Spreiding",
  downloadCsv: "Download CSV",
  downloadImage: "Download afbeelding",
  skipAnimation: "Overslaan",
  replayAnimation: "Opnieuw afspelen",

  tipId: "Nr.",

  errorTitle: "Er ging iets mis",

  types: {
    BOR05: "Boring · 5 m",
    BOR10: "Boring · 10 m",
    BOR20: "Boring · 20 m",
    PB: "Peilbuis",
  },

  aboutTitle: "Hoe werkt het",
  about:
    "DrillPlan legt een raster over het terrein, kiest gelijkmatig verdeelde punten met K-Means en zoekt de verdeling waarbij metingen van hetzelfde type zo ver mogelijk uit elkaar liggen. Alles gebeurt lokaal — je bestand wordt nergens geüpload.",
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
  dropHint: "drag a CSV here, or",
  browse: "Choose a file",
  tryExample: "Try an example",
  downloadExample: "Download example CSV",
  fileNeeds: 'Needs "Position X" and "Position Y" columns.',
  vertexLabel: "{n} vertices loaded",
  noArea: "No site loaded",
  noAreaHint: "Upload a CSV outline to draw the survey area.",
  changeFile: "Change file",

  countsHint: "Set how many locations you need per type.",
  totalLabelText: "Total locations",
  needAtLeastOne: "Choose at least one location.",

  compute: "Calculate placement",
  recompute: "Recalculate",
  computing: "Optimizing placement…",

  resultChip: "{n} placed",
  spreadScore: "Spread",
  downloadCsv: "Download CSV",
  downloadImage: "Download image",
  skipAnimation: "Skip",
  replayAnimation: "Replay",

  tipId: "No.",

  errorTitle: "Something went wrong",

  types: {
    BOR05: "Boring · 5 m",
    BOR10: "Boring · 10 m",
    BOR20: "Boring · 20 m",
    PB: "Monitoring well",
  },

  aboutTitle: "How it works",
  about:
    "DrillPlan lays a grid over the site, picks evenly spread candidate points with K-Means, then searches type assignments so that same-type measurements sit as far apart as possible. Everything runs locally — your file is never uploaded.",
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
