// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { parseAreaCsv, placementsToCsv, polygonToCsv } from "./csv";
import type { DrillType, Placement, Point } from "./algorithm/types";

function csvFile(content: string): File {
  return new File([content], "area.csv", { type: "text/csv" });
}

const drillTypes: DrillType[] = [
  { id: "a", code: "BOR05", color: "#000", symbol: "circle" },
  { id: "b", code: "BOR10", color: "#000", symbol: "square" },
  { id: "c", code: "BOR20", color: "#000", symbol: "diamond" },
  { id: "d", code: "PB", color: "#000", symbol: "triangle" },
];

describe("placementsToCsv", () => {
  it("prefixes a NR,X,Y,Z,Type header, then id,x(4dp),y(4dp),0.0,CODE rows", () => {
    const placements: Placement[] = [
      { id: "001", x: 123.456789, y: 456.7, typeIndex: 0 },
      { id: "002", x: 1, y: 2, typeIndex: 3 },
    ];
    expect(placementsToCsv(placements, drillTypes)).toBe(
      "NR,X,Y,Z,Type\n001,123.4568,456.7000,0.0,BOR05\n002,1.0000,2.0000,0.0,PB",
    );
  });

  it("maps each typeIndex to the right drill-type code", () => {
    const placements: Placement[] = [
      { id: "001", x: 0, y: 0, typeIndex: 0 },
      { id: "002", x: 0, y: 0, typeIndex: 1 },
      { id: "003", x: 0, y: 0, typeIndex: 2 },
      { id: "004", x: 0, y: 0, typeIndex: 3 },
    ];
    const codes = placementsToCsv(placements, drillTypes)
      .split("\n")
      .slice(1) // drop the header row
      .map((line) => line.split(",")[4]);
    expect(codes).toEqual(["BOR05", "BOR10", "BOR20", "PB"]);
  });

  it("returns just the header row for no placements", () => {
    expect(placementsToCsv([], drillTypes)).toBe("NR,X,Y,Z,Type");
  });
});

describe("polygonToCsv", () => {
  it("emits a Position X/Position Y header that parseAreaCsv round-trips", async () => {
    const polygon: Point[] = [
      { x: 155000, y: 463000 },
      { x: 155180.5, y: 463040.2 },
      { x: 155360, y: 463010 },
      { x: 154940, y: 463080 },
    ];
    const csv = polygonToCsv(polygon);
    expect(csv.split("\n")[0]).toBe("Position X,Position Y");

    const file = csvFile(csv);
    const { polygon: parsed } = await parseAreaCsv(file);
    expect(parsed).toHaveLength(polygon.length);
    parsed.forEach((p, i) => {
      expect(p.x).toBeCloseTo(polygon[i].x, 1);
      expect(p.y).toBeCloseTo(polygon[i].y, 1);
    });
  });
});

describe("parseAreaCsv", () => {
  it("parses a valid area CSV into finite polygon points", async () => {
    const file = csvFile(
      "Position X,Position Y\n0,0\n10,0\n10,10\n0,10\n",
    );
    const { polygon } = await parseAreaCsv(file);
    expect(polygon).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]);
  });

  it("matches headers case- and whitespace-insensitively", async () => {
    const file = csvFile(
      "  POSITION   X ,position y\n1,2\n3,4\n5,6\n",
    );
    const { polygon } = await parseAreaCsv(file);
    expect(polygon).toEqual([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
      { x: 5, y: 6 },
    ]);
  });

  it("skips rows with non-numeric coordinates", async () => {
    const file = csvFile(
      "Position X,Position Y\n0,0\nfoo,bar\n10,0\n10,10\n",
    );
    const { polygon } = await parseAreaCsv(file);
    expect(polygon).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]);
  });

  it("rejects when the required columns are missing", async () => {
    const file = csvFile("Lat,Lng\n0,0\n1,1\n2,2\n");
    await expect(parseAreaCsv(file)).rejects.toThrow(/Position X/);
  });

  it("rejects an empty file", async () => {
    await expect(parseAreaCsv(csvFile(""))).rejects.toThrow(/empty/);
  });

  it("rejects when fewer than 3 valid points remain", async () => {
    const file = csvFile("Position X,Position Y\n0,0\n10,0\n");
    await expect(parseAreaCsv(file)).rejects.toThrow(/at least 3/);
  });
});
