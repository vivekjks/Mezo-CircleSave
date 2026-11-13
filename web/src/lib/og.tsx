import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };

type OgFont = { name: string; data: ArrayBuffer; weight: 400 | 700 | 800; style: "normal" };

/** Loads Hanken Grotesk from Google Fonts (TTF) so share cards match the app; falls back silently. */
async function loadFonts(): Promise<OgFont[]> {
  const weights = [400, 700, 800] as const;
  const fonts = await Promise.all(
    weights.map(async (weight) => {
      try {
        const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@${weight}`)).text();
        const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
        if (!url) return null;
        const data = await (await fetch(url)).arrayBuffer();
        return { name: "Hanken Grotesk", data, weight, style: "normal" as const };
      } catch {
        return null;
      }
    }),
  );
  return fonts.filter((f): f is OgFont => f !== null);
}

function Dots() {
  const dots = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    return { x: 28 + Math.cos(a) * 20, y: 28 + Math.sin(a) * 20, first: i === 0 };
  });
  return (
    <svg width="56" height="56" viewBox="0 0 56 56">
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={d.first ? 6 : 4.5} fill={d.first ? "#1d4ed8" : "#000000"} />
      ))}
      <circle cx="28" cy="28" r="7" fill="none" stroke="#000000" strokeWidth="3" />
    </svg>
  );
}

/** Share card in the product's three colours: white page, black type, blue accent. */
export async function ogCard({ kicker, title, lines }: { kicker: string; title: string; lines: string[] }) {
  const fonts = await loadFonts();
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#ffffff", padding: "64px 72px", fontFamily: fonts.length ? "Hanken Grotesk" : "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <Dots />
          <div style={{ fontSize: 38, fontWeight: 700, color: "#000000", letterSpacing: -1 }}>CircleSave</div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, border: "2px solid #d4d4d4", borderRadius: 999, padding: "8px 18px", fontSize: 22, color: "#525252" }}>
            <div style={{ width: 10, height: 10, borderRadius: 999, background: "#1d4ed8" }} />
            Mezo Testnet
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 30, color: "#1d4ed8", fontWeight: 700 }}>{kicker}</div>
          <div style={{ fontSize: title.length > 40 ? 64 : 80, fontWeight: 800, color: "#000000", letterSpacing: -2.5, lineHeight: 1.04, maxWidth: 1000 }}>{title}</div>
        </div>
        <div style={{ display: "flex", gap: 0, borderTop: "2px solid #e5e5e5", paddingTop: 28 }}>
          {lines.map((l, i) => (
            <div key={i} style={{ display: "flex", fontSize: 28, color: i === 0 ? "#000000" : "#525252", paddingRight: 36, marginRight: 36, borderRight: i < lines.length - 1 ? "2px solid #e5e5e5" : "none" }}>
              {l}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts },
  );
}
