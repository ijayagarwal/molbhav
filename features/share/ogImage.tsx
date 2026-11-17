// The shared parchi's preview image (G4, DESIGN §21.3): 1200×630, the same facts as /p/[publicId]. Built
// with @vercel/og 1.0.3, whose HarfBuzz shaping draws Devanagari conjuncts and matras correctly (its missing
// dist/hb.wasm is supplied by scripts/og-wasm.mjs), and the static TTFs in assets/og. Server-only.
import { ImageResponse } from "@vercel/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { LIGHT } from "@/lib/tokens";

export interface OgFacts {
  headline: string;
  sub: string;
  dealer: string | null;
  total: string | null;
  items: string[];
  demoLabel: string | null;
  brand: string;
}

export const OG_SIZE = { width: 1200, height: 630 };

async function fonts() {
  const dir = path.join(process.cwd(), "assets/og");
  const [anek, anekWide, mukta, muktaBold] = await Promise.all(
    ["anek-700.ttf", "anek-800-w125.ttf", "mukta-400.ttf", "mukta-600.ttf"].map((f) => readFile(path.join(dir, f))),
  );
  return [
    { name: "Anek", data: anek, weight: 700 as const, style: "normal" as const },
    { name: "AnekWide", data: anekWide, weight: 800 as const, style: "normal" as const },
    { name: "Mukta", data: mukta, weight: 400 as const, style: "normal" as const },
    { name: "Mukta", data: muktaBold, weight: 600 as const, style: "normal" as const },
  ];
}

export async function parchiOgImage(f: OgFacts): Promise<ImageResponse> {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: LIGHT.paper, padding: 56, gap: 48, fontFamily: "Mukta" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 560 }}>
          <div style={{ display: "flex", fontFamily: "Anek", fontWeight: 700, fontSize: 44, color: LIGHT.ink }}>{f.brand}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", fontFamily: "Anek", fontWeight: 700, fontSize: 62, lineHeight: 1.15, color: LIGHT.hara }}>{f.headline}</div>
            <div style={{ display: "flex", fontSize: 30, color: LIGHT["ink-2"] }}>{f.sub}</div>
          </div>
          <div style={{ display: "flex" }} />
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            background: LIGHT.card,
            border: `4px solid ${LIGHT.ink}`,
            borderRadius: 8,
            boxShadow: `10px 10px 0 ${LIGHT.ink}`,
            padding: 36,
            gap: 14,
            position: "relative",
          }}
        >
          {f.demoLabel ? (
            <div style={{ display: "flex", position: "absolute", top: 24, right: 24, border: `3px solid ${LIGHT.lal}`, color: LIGHT.lal, borderRadius: 6, padding: "2px 12px", fontSize: 22, fontWeight: 600, transform: "rotate(-6deg)" }}>
              {f.demoLabel}
            </div>
          ) : null}
          {f.dealer ? <div style={{ display: "flex", fontFamily: "Anek", fontWeight: 700, fontSize: 38, color: LIGHT.ink, marginTop: 48 }}>{f.dealer}</div> : null}
          {f.total ? <div style={{ display: "flex", fontFamily: "AnekWide", fontWeight: 800, fontSize: 64, color: LIGHT.ink }}>{f.total}</div> : null}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: `2px dashed ${LIGHT.rule}`, paddingTop: 14 }}>
            {f.items.map((line) => (
              <div key={line} style={{ display: "flex", fontSize: 28, color: LIGHT.ink }}>
                {line}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: await fonts() },
  );
}
