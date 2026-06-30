"use client";

import { useCallback, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";

interface FileUploadProps {
  onFile: (file: File) => void;
  onExample: () => void;
  onDownloadExample: () => void;
}

export function FileUpload({ onFile, onExample, onDownloadExample }: FileUploadProps) {
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
          if (!dragging) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-[13px] border-2 border-dashed px-5 py-[30px] text-center transition ${
          dragging ? "border-clay bg-clay-soft-bg" : "border-[#d3c6ac] bg-surface-2"
        }`}
      >
        <span className="mb-3.5 inline-flex items-center gap-2 rounded-lg border-[1.5px] border-[#cdbfa6] bg-white px-[11px] py-[7px]">
          <svg
            width="15"
            height="17"
            viewBox="0 0 24 26"
            fill="none"
            stroke="#bd5a2e"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M14 2H5a2 2 0 0 0-2 2v18a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9z" />
            <path d="M14 2v7h7" />
            <path d="M7.5 14h6M7.5 18h9" />
          </svg>
          <span className="font-mono text-xs font-semibold tracking-[0.04em] text-clay">
            .CSV
          </span>
        </span>
        <p className="text-[14.5px] font-semibold text-ink">{t.dropHere}</p>
        <p className="mt-1.5 text-[13px] text-ink-3">{t.dropHint}</p>
        <span className="mt-3.5 inline-flex items-center rounded-[9px] bg-clay px-[18px] py-[9px] text-[13.5px] font-semibold text-clay-on transition hover:bg-clay-hover">
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

      <div className="mt-[13px] flex items-center justify-between gap-2.5">
        <span className="max-w-[160px] text-xs leading-snug text-ink-3">{t.fileNeeds}</span>
        <div className="flex flex-col items-end gap-1.5">
          <button
            type="button"
            onClick={onExample}
            className="cursor-pointer whitespace-nowrap text-[13px] font-semibold text-clay underline underline-offset-[3px]"
          >
            {t.tryExample}
          </button>
          <button
            type="button"
            onClick={onDownloadExample}
            className="cursor-pointer whitespace-nowrap text-[12.5px] font-medium text-ink-3 underline underline-offset-[3px] transition hover:text-ink"
          >
            {t.downloadExample}
          </button>
        </div>
      </div>
    </div>
  );
}
