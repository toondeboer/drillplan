"use client";

import { useI18n, type Language } from "@/lib/i18n";

const OPTIONS: { value: Language; label: string }[] = [
  { value: "en", label: "EN" },
  { value: "nl", label: "NL" },
];

export function LanguageToggle() {
  const { lang, setLang } = useI18n();
  return (
    <div
      role="group"
      aria-label="Language"
      className="flex overflow-hidden rounded-lg border border-divider"
    >
      {OPTIONS.map((opt) => {
        const active = lang === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setLang(opt.value)}
            aria-pressed={active}
            className={`cursor-pointer px-[11px] py-1.5 font-mono text-xs font-semibold tracking-[0.04em] transition ${
              active ? "bg-clay text-clay-on" : "bg-[#f7f2e7] text-ink-3 hover:text-ink-2"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
