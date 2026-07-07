// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseAreaShapefile } from "./shapefile";

/** Build a File from a bundled fixture, mirroring how the browser hands us the upload. */
function shpFixture(name: string): File {
  return new File([readFileSync(resolve("lib/__fixtures__", name))], name);
}

describe("parseAreaShapefile", () => {
  it("reads the polygon ring from a real QGIS .shp (RD / EPSG:28992)", async () => {
    const { polygon } = await parseAreaShapefile(shpFixture("shape1.shp"));

    // 6 stored points, last repeats the first — the closing vertex is dropped.
    expect(polygon).toHaveLength(5);
    for (const p of polygon) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
    // Coordinates are RD metres in the ~10^5 range, taken verbatim (no reprojection).
    expect(polygon[0].x).toBeCloseTo(104880.433, 2);
    expect(polygon[0].y).toBeCloseTo(493346.381, 2);
    expect(polygon.every((p) => p.x > 100000 && p.x < 110000)).toBe(true);
    expect(polygon.every((p) => p.y > 490000 && p.y < 500000)).toBe(true);
  });

  it("rejects an empty shapefile (valid header, zero features)", async () => {
    await expect(parseAreaShapefile(shpFixture("shape2.shp"))).rejects.toThrow(
      /empty/,
    );
  });

  it("rejects a buffer that isn't a shapefile", async () => {
    const file = new File([new Uint8Array(200)], "not.shp");
    await expect(parseAreaShapefile(file)).rejects.toThrow(/valid shapefile/);
  });

  it("rejects a file too small to be a shapefile", async () => {
    const file = new File([new Uint8Array(10)], "tiny.shp");
    await expect(parseAreaShapefile(file)).rejects.toThrow(/too small/);
  });
});
