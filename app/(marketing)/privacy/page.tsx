import { Placeholder } from "@/components/mb/Placeholder";
import { getServerDict } from "@/lib/i18n/server";

// Phase 1C writes the privacy notice (S4).
export default async function PrivacyPage() {
  const { t } = await getServerDict();
  return <Placeholder title={t["brand.name"]} body={t["placeholder.soon"]} />;
}
