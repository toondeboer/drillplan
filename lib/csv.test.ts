// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { parseAreaCsv, placementsToCsv } from "./csv";
import type { Placement } from "./algorithm/types";

function csvFile(content: string): File {
  return new File([content], "area.csv", { type: "text/csv" });
}

describe("placementsToCsv", () => {
  it("formats header-less rows as id,x(4dp),y(4dp),0.0,CODE", () => {
    const placements: Placement[] = [
      { id: "001", x: 123.456789, y: 456.7, typeIndex: 0 },
      { id: "002", x: 1, y: 2, typeIndex: 3 },
    ];
    expect(placementsToCsv(placements)).toBe(
      "001,123.4568,456.7000,0.0,BOR05\n002,1.0000,2.0000,0.0,PB",
    );
  });

  it("maps each typeIndex to the right measurement code", () => {
    const placements: Placement[] = [
      { id: "001", x: 0, y: 0, typeIndex: 0 },
      { id: "002", x: 0, y: 0, typeIndex: 1 },
      { id: "003", x: 0, y: 0, typeIndex: 2 },
      { id: "004", x: 0, y: 0, typeIndex: 3 },
    ];
    const codes = placementsToCsv(placements)
      .split("\n")
      .map((line) => line.split(",")[4]);
    expect(codes).toEqual(["BOR05", "BOR10", "BOR20", "PB"]);
  });

  it("returns an empty string for no placements", () => {
    expect(placementsToCsv([])).toBe("");
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
