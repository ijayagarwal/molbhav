import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { getServerDict } from "@/lib/i18n/server";
import { formatPaise } from "@/lib/numbers";
import { sharedItemLine } from "@/lib/shareText";
import { parchiOgImage } from "./ogImage";

/**
 * The shared parchi's image (G4): the same facts as /p/<id>, in the viewer's language. Served twice: as the
 * page's og:image (opengraph-image.tsx, whose URL Next.js hashes in production) and at the fixed path
 * /p/<id>/parchi.png, which the share sheet fetches to attach the picture to navigator.share.
 */
export async function sharedParchiImage(publicId: string) {
  const { lang, t, tf } = await getServerDict();
  const view = await fetchQuery(api.share.get, { publicId }).catch(() => null);
  if (view === null) {
    return parchiOgImage({ brand: t["brand.name"], headline: t["shared.gone"], sub: t["brand.tagline"], dealer: null, total: null, items: [], demoLabel: null });
  }
  const dealer = view.dealer ? (lang === "hi" ? (view.dealer.nameHi ?? view.dealer.name) : view.dealer.name) : null;
  return parchiOgImage({
    brand: t["brand.name"],
    headline: view.saved !== null ? tf("shared.saved", { name: view.contractor ?? "", x: formatPaise(view.saved).replace("₹", "") }) : view.mode === "munshi" ? t["shared.munshiTitle"] : t["shared.found"],
    sub: view.saved !== null ? (view.basis === "first_rate" ? t["shared.savedVsFirst"] : t["shared.savedVsMedian"]) : t["brand.tagline"],
    dealer,
    total: view.total !== null ? formatPaise(view.total) : null,
    items: view.items.map((i) => sharedItemLine(i, lang)),
    demoLabel: view.demo ? t["demo.watermark"] : null,
  });
}
