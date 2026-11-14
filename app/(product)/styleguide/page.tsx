import { Placeholder } from "@/components/mb/Placeholder";
import { getServerDict } from "@/lib/i18n/server";

// Phase 1B builds the styleguide.
export default async function StyleguidePage() {
  const { t } = await getServerDict();
  return <Placeholder title={t["brand.name"]} body={t["placeholder.soon"]} />;
}
