import "server-only";
import { buildMoneyShot, CAPTIONS } from "@/features/moneyShot/data";
import type { DealerKey } from "@/features/moneyShot/timeline";
import { CITY_AREAS, DELIVER_BY } from "@/lib/config";
import { DEMO_ITEMS } from "@/lib/fixtures/demoOrder";
import { format } from "@/lib/i18n/format";
import type { Dict } from "@/lib/i18n/getDict";
import type { Lang } from "@/lib/i18n/lang";
import { formatRate } from "@/lib/numbers";
import { lineBreakdown } from "@/lib/pricing";
import type { HeroBoardData } from "./HeroBoard";

// The landing hero board's fixtures, computed HERE on the server from the personas' TEAM_TEST quotes priced by
// lib/pricing.ts (features/moneyShot/data.ts), so the client gets plain numbers and words and none of the
// pricing or persona code. All dealers are fictional; all prices are test fixtures (labelled DEMO).

/** The fixtures are priced as of this date (bands fresh on it); the totals don't depend on it. */
const FIXTURE_DATE = Date.UTC(2026, 10, 15);

export function heroBoardData(lang: Lang, t: Dict): HeroBoardData {
  const ms = buildMoneyShot(FIXTURE_DATE);
  const area = (key: string) => CITY_AREAS.Jaipur.find((a) => a.key === key)?.[lang] ?? key;
  const dealer = (k: DealerKey) => ({ name: lang === "hi" ? ms.dealers[k].nameHi : ms.dealers[k].name, area: area(ms.dealers[k].area) });
  const term = (k: "agarwal" | "omsai" | "balaji") => ({
    credit: ms.terms[k].creditDays > 0 ? format(t["parchi.credit"], { n: ms.terms[k].creditDays }) : t["parchi.cash"],
    delivery: ms.terms[k].deliveryBy ? DELIVER_BY[ms.terms[k].deliveryBy][lang] : "—",
  });
  const unit = (u: string) => t[`unit.${u}` as keyof Dict] ?? u;
  const rateUnit = (u: string) => t[`rateUnit.${u}` as keyof Dict] ?? u;

  const w = ms.winnerFacts;
  const lines: HeroBoardData["parchi"]["lines"] = lineBreakdown(DEMO_ITEMS, w.lines, true).map((l) => {
    const item = DEMO_ITEMS.find((i) => i.id === l.itemId)!;
    const what = item.material === "tmt_steel" ? `TMT ${item.diameterMm}mm ${item.grade}` : `${item.cementType}`;
    return { label: `${what} · ${item.quantity} ${unit(item.unit!)} × ${formatRate(l.rate)}/${rateUnit(l.rateUnit)}`, amount: l.subtotal };
  });
  const charges = (w.deliveryCharge ?? 0) + (w.unloadingCharge ?? 0);
  lines.push({ label: format(t["parchi.gst"], { rate: 18 }), amount: ms.winnerGstPaise });
  lines.push({ label: t["parchi.deliveryUnloading"], amount: charges === 0 ? t["parchi.free"] : charges * 100, tone: charges === 0 ? "hara" : undefined });

  return {
    dealers: { agarwal: dealer("agarwal"), omsai: dealer("omsai"), rathore: dealer("rathore"), gupta: dealer("gupta"), balaji: dealer("balaji") },
    totals: ms.totals,
    terms: { agarwal: term("agarwal"), omsai: term("omsai"), balaji: term("balaji") },
    captions: {
      agarwal: [...CAPTIONS.agarwal],
      omsai: [...CAPTIONS.omsai],
      rathore: [...CAPTIONS.rathore],
      omsaiHaggle: [...CAPTIONS.omsaiHaggle],
      agarwalHaggle: [...CAPTIONS.agarwalHaggle],
      balajiMatch: [...CAPTIONS.balajiMatch],
    },
    parchi: {
      dealerName: dealer("agarwal").name,
      totalPaise: ms.totals.agarwal.haggle,
      lines,
      chips: [w.deliveryBy ? DELIVER_BY[w.deliveryBy][lang] : null, term("agarwal").credit, `${t["parchi.pakka"]} · ${t["parchi.kanta"]}`].filter((c): c is string => c !== null),
    },
    savedPaise: ms.savedPaise,
    firstRatePaise: ms.firstRatePaise,
  };
}
