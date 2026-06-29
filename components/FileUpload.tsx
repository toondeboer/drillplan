"use client";

import { useCallback, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";

interface FileUploadProps {
  onFile: (file: File) => void;
  onExample: () => void;
}

export function FileUpload({ onFile, onExample }: FileUploadProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) onFile(file);
    },
    [onFile],
  );

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
          dragging
            ? "border-brand-500 bg-brand-50"
            : "border-slate-300 bg-slate-50 hover:border-brand-400 hover:bg-brand-50/50"
        }`}
      >
        <svg
          className="mb-3 h-10 w-10 text-brand-500"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
          />
        </svg>
        <p className="font-medium text-slate-700">{t.dropHere}</p>
        <p className="mt-1 text-sm text-slate-400">{t.dropHint}</p>
        <span className="mt-3 inline-flex items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700">
          {t.browse}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-slate-400">{t.fileNeeds}</p>
        <button
          type="button"
          onClick={onExample}
          className="font-semibold text-brand-600 underline-offset-2 hover:underline"
        >
          {t.tryExample}
        </button>
      </div>
    </div>
  );
}
