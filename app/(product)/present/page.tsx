import { Placeholder } from "@/components/mb/Placeholder";
import { getServerDict } from "@/lib/i18n/server";

// Phase 7 builds the presenter view (B8).
export default async function PresentPage() {
  const { t } = await getServerDict();
  return <Placeholder title={t["brand.name"]} body={t["placeholder.soon"]} />;
}
