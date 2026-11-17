import { LANDING_OG_SIZE, landingOgImage } from "@/features/marketing/landingOg";
import { getDict } from "@/lib/i18n/getDict";

// The landing page's og:image (Phase 1C SEO), also inherited by /dealer and /privacy (/p has its own). It has no
// request data, so it is rendered once at build time, where the static TTFs and hb.wasm are on disk.
export const dynamic = "force-static";
export const runtime = "nodejs";
export const size = LANDING_OG_SIZE;
export const contentType = "image/png";
export const alt = getDict("hi")["meta.ogAlt"];

export default async function Image() {
  return await landingOgImage();
}
