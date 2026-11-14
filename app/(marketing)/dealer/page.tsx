import { Placeholder } from "@/components/mb/Placeholder";
import { getServerDict } from "@/lib/i18n/server";

// Phase 1C builds the Hindi dealer opt-in (G5, S2).
export default async function DealerOptInPage() {
  const { t } = await getServerDict();
  return <Placeholder title={t["brand.name"]} body={t["placeholder.soon"]} />;
}
