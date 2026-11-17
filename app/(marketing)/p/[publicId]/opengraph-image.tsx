import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { OG_SIZE, parchiOgImage } from "@/features/share/ogImage";
import { getServerDict } from "@/lib/i18n/server";
import { formatPaise } from "@/lib/numbers";
import { sharedItemLine } from "@/lib/shareText";

// The shared parchi's preview image for WhatsApp (G4): the same facts as the page, in the viewer's language.
export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Molbhav parchi";

export default async function Image({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
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
