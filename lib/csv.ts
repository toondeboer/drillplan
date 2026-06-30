import Papa from "papaparse";
import { MEASUREMENT_TYPES, type Placement, type Point } from "./algorithm/types";

export interface ParsedArea {
  polygon: Point[];
}

/** Normalize a header into a lowercase, space-collapsed key for tolerant matching. */
function normalizeKey(key: string): string {
  return key.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Parse an uploaded area CSV. Requires "Position X" and "Position Y" columns
 * (case/whitespace tolerant). Each row is a vertex of the site outline.
 */
export function parseAreaCsv(file: File): Promise<ParsedArea> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data;
        if (!rows.length) {
          reject(new Error("The file is empty."));
          return;
        }
        const fields = (results.meta.fields ?? []).reduce<Record<string, string>>(
          (acc, f) => {
            acc[normalizeKey(f)] = f;
            return acc;
          },
          {},
        );
        const xKey = fields["position x"];
        const yKey = fields["position y"];
        if (!xKey || !yKey) {
          reject(
            new Error('The file must have "Position X" and "Position Y" columns.'),
          );
          return;
        }

        const polygon: Point[] = [];
        for (const row of rows) {
          const x = parseFloat(row[xKey]);
          const y = parseFloat(row[yKey]);
          if (Number.isFinite(x) && Number.isFinite(y)) {
            polygon.push({ x, y });
          }
        }
        if (polygon.length < 3) {
          reject(new Error("The area needs at least 3 valid points."));
          return;
        }
        resolve({ polygon });
      },
      error: (err) => reject(err),
    });
  });
}

/**
 * Build an area CSV in the format `parseAreaCsv` expects: a "Position X,Position Y"
 * header followed by one row per polygon vertex. Used for the downloadable example.
 */
export function polygonToCsv(polygon: Point[]): string {
  const header = "Position X,Position Y";
  const rows = polygon.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`);
  return [header, ...rows].join("\n");
}

/**
 * Build the result CSV in the same format as the legacy script:
 * `id, x(4 decimals), y(4 decimals), 0.0, type` with no header row.
 */
export function placementsToCsv(placements: Placement[]): string {
  return placements
    .map((p) =>
      [
        p.id,
        p.x.toFixed(4),
        p.y.toFixed(4),
        "0.0",
        MEASUREMENT_TYPES[p.typeIndex].code,
      ].join(","),
    )
    .join("\n");
}

/** Trigger a client-side download of `content` as `filename`. */
export function downloadFile(filename: string, content: string, mime = "text/csv"): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
