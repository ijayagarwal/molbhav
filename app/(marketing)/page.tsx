import { Placeholder } from "@/components/mb/Placeholder";
import { getServerDict } from "@/lib/i18n/server";

// Phase 1C builds the landing page (DESIGN §21).
export default async function LandingPage() {
  const { t } = await getServerDict();
  return <Placeholder title={t["brand.name"]} body={t["brand.tagline"]} />;
}
