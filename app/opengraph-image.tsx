import { ImageResponse } from "next/og";

export const alt = "DrillPlan — evenly spread drilling locations";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Staggered grid of drilling points, echoing what the tool produces.
const POINTS = Array.from({ length: 5 }, (_, row) =>
  Array.from({ length: 5 }, (_, col) => ({
    x: 60 + col * 80 + (row % 2) * 40,
    y: 80 + row * 80,
  })),
).flat();

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 90px",
          background: "#ece4d3",
          color: "#2a2419",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", width: 560 }}>
          <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: -2 }}>
            DrillPlan
          </div>
          <div style={{ fontSize: 38, color: "#6f6657", marginTop: 20 }}>
            Evenly spread drilling locations, planned in your browser.
          </div>
          <div
            style={{ width: 120, height: 8, background: "#bd5a2e", marginTop: 40 }}
          />
        </div>
        <div
          style={{
            position: "relative",
            display: "flex",
            width: 480,
            height: 480,
            background: "#fbf8f1",
            border: "3px solid #ddd2bd",
            borderRadius: 24,
          }}
        >
          {POINTS.map((p, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: p.x - 14,
                top: p.y - 14,
                width: 28,
                height: 28,
                borderRadius: 14,
                background: "#bd5a2e",
              }}
            />
          ))}
        </div>
      </div>
    ),
    size,
  );
}
