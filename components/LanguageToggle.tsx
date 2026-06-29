"use client";

import { useI18n, type Language } from "@/lib/i18n";

const OPTIONS: { value: Language; label: string }[] = [
  { value: "nl", label: "NL" },
  { value: "en", label: "EN" },
];

export function LanguageToggle() {
  const { lang, setLang } = useI18n();
  return (
    <div
      role="group"
      aria-label="Language"
      className="inline-flex rounded-full border border-slate-200 bg-white/70 p-0.5 shadow-sm backdrop-blur"
    >
      {OPTIONS.map((opt) => {
        const active = lang === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setLang(opt.value)}
            aria-pressed={active}
            className={`rounded-full px-3 py-1 text-sm font-semibold transition ${
              active
                ? "bg-brand-600 text-white shadow"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
