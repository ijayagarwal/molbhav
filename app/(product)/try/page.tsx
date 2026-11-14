import { Placeholder } from "@/components/mb/Placeholder";
import { getServerDict } from "@/lib/i18n/server";

// Phase 7 builds the /try sandbox (G3).
export default async function SandboxPage() {
  const { t } = await getServerDict();
  return <Placeholder title={t["brand.name"]} body={t["placeholder.soon"]} />;
}
