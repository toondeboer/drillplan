import type { Point } from "./algorithm/types";
import type { ParsedArea } from "./csv";

// ESRI shape-type codes that carry polygon geometry (2D, Z, and M variants).
const POLYGON_TYPES = new Set([5, 15, 25]);
const FILE_CODE = 9994;
const HEADER_BYTES = 100;

/**
 * Parse the geometry of a QGIS/ESRI shapefile's `.shp` file into a site-outline
 * polygon, matching the {@link ParsedArea} shape that `parseAreaCsv` produces so it
 * plugs into the same upload path.
 *
 * Only the `.shp` is read — it holds the ring coordinates; the sibling
 * `.dbf/.shx/.prj/.cpg/.qmd` files are not needed for the outline. Coordinates are
 * taken verbatim: DrillPlan assumes Dutch RD (EPSG:28992) metres and does no
 * reprojection (see the CRS sanity check below). The largest ring across all
 * polygon records is used as the site boundary — the app's single-ring model can't
 * represent multi-part polygons or holes.
 */
export async function parseAreaShapefile(shp: File): Promise<ParsedArea> {
  const buf = await shp.arrayBuffer();
  if (buf.byteLength < HEADER_BYTES) {
    throw new Error("This doesn't look like a valid shapefile (.shp too small).");
  }
  const view = new DataView(buf);

  // File header: code is big-endian at byte 0; the file's shape type is
  // little-endian at byte 32.
  if (view.getInt32(0, false) !== FILE_CODE) {
    throw new Error("This doesn't look like a valid shapefile (.shp).");
  }
  const shapeType = view.getInt32(32, true);
  if (shapeType !== 0 && !POLYGON_TYPES.has(shapeType)) {
    throw new Error("The .shp must contain polygons, not points or lines.");
  }

  const rings: Point[][] = [];
  let offset = HEADER_BYTES;
  while (offset + 8 <= buf.byteLength) {
    // Record header (big-endian): record number, then content length in 16-bit words.
    const contentLen = view.getInt32(offset + 4, false) * 2;
    const contentStart = offset + 8;
    offset = contentStart + contentLen;
    if (contentStart + 4 > buf.byteLength) break;

    // Record content is all little-endian.
    const recType = view.getInt32(contentStart, true);
    if (recType === 0) continue; // null shape
    if (!POLYGON_TYPES.has(recType)) continue;

    // Content: type(4) + bbox(32) + numParts(4) + numPoints(4) + parts[] + XY points[].
    const numParts = view.getInt32(contentStart + 36, true);
    const numPoints = view.getInt32(contentStart + 40, true);
    const partsStart = contentStart + 44;
    const pointsStart = partsStart + numParts * 4;
    if (pointsStart + numPoints * 16 > buf.byteLength) break; // truncated record

    for (let p = 0; p < numParts; p++) {
      const startIdx = view.getInt32(partsStart + p * 4, true);
      const endIdx =
        p + 1 < numParts ? view.getInt32(partsStart + (p + 1) * 4, true) : numPoints;
      const ring: Point[] = [];
      for (let i = startIdx; i < endIdx; i++) {
        const x = view.getFloat64(pointsStart + i * 16, true);
        const y = view.getFloat64(pointsStart + i * 16 + 8, true);
        ring.push({ x, y });
      }
      rings.push(ring);
    }
  }

  if (!rings.length) {
    throw new Error(
      "This shapefile is empty (no features) — check the layer has geometry before exporting.",
    );
  }

  // Take the largest ring by absolute area as the site outline.
  let outline = rings[0];
  let bestArea = -1;
  for (const ring of rings) {
    const area = Math.abs(shoelaceArea(ring));
    if (area > bestArea) {
      bestArea = area;
      outline = ring;
    }
  }

  // Shapefile rings repeat their first point to close; drop it to match the
  // open-ring style the CSV path produces.
  const polygon = dropClosingVertex(outline).filter(
    (p) => Number.isFinite(p.x) && Number.isFinite(p.y),
  );

  if (polygon.length < 3) {
    throw new Error("The area needs at least 3 valid points.");
  }
  // CRS sanity check: RD coordinates are metres in the ~10^5 range. If every point
  // is tiny, the file is almost certainly lat/lng degrees, which the app can't place.
  if (polygon.every((p) => Math.abs(p.x) < 1000 && Math.abs(p.y) < 1000)) {
    throw new Error(
      "Coordinates look like latitude/longitude — DrillPlan expects Dutch RD (EPSG:28992) metres.",
    );
  }

  return { polygon };
}

/** Signed polygon area (shoelace formula). */
function shoelaceArea(ring: Point[]): number {
  let sum = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

/** Drop the trailing vertex when a ring repeats its first point (closed ring). */
function dropClosingVertex(ring: Point[]): Point[] {
  if (ring.length > 1) {
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first.x === last.x && first.y === last.y) {
      return ring.slice(0, -1);
    }
  }
  return ring;
}
