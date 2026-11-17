// The landing page's preview image (1200×630) for WhatsApp and social links: the Hindi tagline, the English
// one, the Jaipur pilot line (G2) and the three steps. No figures, nothing that claims AI calls are live.
// Bilingual, so one static image serves both languages. Same renderer and static TTFs as the shared parchi
// (features/share/ogImage.tsx: @vercel/og 1.0.3 under the "vercel-og" alias, for Devanagari shaping).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "vercel-og";
import { getDict } from "@/lib/i18n/getDict";
import { LIGHT } from "@/lib/tokens";

export const LANDING_OG_SIZE = { width: 1200, height: 630 };

async function fonts() {
  const dir = path.join(process.cwd(), "assets/og");
  const [anek, mukta, muktaBold] = await Promise.all(["anek-700.ttf", "mukta-400.ttf", "mukta-600.ttf"].map((f) => readFile(path.join(dir, f))));
  return [
    { name: "Anek", data: anek, weight: 700 as const, style: "normal" as const },
    { name: "Mukta", data: mukta, weight: 400 as const, style: "normal" as const },
    { name: "Mukta", data: muktaBold, weight: 600 as const, style: "normal" as const },
  ];
}

export async function landingOgImage(): Promise<ImageResponse> {
  const hi = getDict("hi");
  const en = getDict("en");
  const steps = [hi["landing.step1Title"], hi["landing.step2Title"], hi["landing.step3Title"]];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: LIGHT.paper, padding: 64, gap: 56, fontFamily: "Mukta" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1 }}>
          <div style={{ display: "flex", fontFamily: "Anek", fontWeight: 700, fontSize: 52, color: LIGHT.ink, textShadow: `4px 4px 0 ${LIGHT.haldi}` }}>{hi["brand.name"]}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", flexDirection: "column", fontFamily: "Anek", fontWeight: 700, fontSize: 74, lineHeight: 1.25, color: LIGHT.ink }}>
              <span>{hi["landing.heroLine1"]}</span>
              <span>{hi["landing.heroLine2"]}</span>
            </div>
            <div style={{ display: "flex", fontSize: 36, fontWeight: 600, color: LIGHT["ink-2"] }}>{en["brand.tagline"]}</div>
          </div>
          <div style={{ display: "flex", borderLeft: `8px solid ${LIGHT.haldi}`, paddingLeft: 18, fontSize: 28, fontWeight: 600, color: LIGHT.ink }}>{hi["landing.pilot"]}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: 300 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 22,
              background: LIGHT.card,
              border: `4px solid ${LIGHT.ink}`,
              borderRadius: 12,
              boxShadow: `10px 10px 0 ${LIGHT.ink}`,
              padding: 32,
            }}
          >
            {steps.map((s, i) => (
              <div key={s} style={{ display: "flex", alignItems: "center", gap: 18 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 56,
                    height: 56,
                    borderRadius: 28,
                    background: LIGHT.haldi,
                    border: `3px solid ${LIGHT.ink}`,
                    fontFamily: "Anek",
                    fontWeight: 700,
                    fontSize: 30,
                    color: LIGHT.ink,
                  }}
                >
                  {String(i + 1)}
                </div>
                <div style={{ display: "flex", fontFamily: "Anek", fontWeight: 700, fontSize: 40, color: LIGHT.ink }}>{s}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    { ...LANDING_OG_SIZE, fonts: await fonts() },
  );
}
