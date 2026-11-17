import type { Metadata } from "next";
import { TryOrder } from "@/features/try/TryOrder";
import { getServerDict } from "@/lib/i18n/server";

// /try/<id>: one sandbox order, draft → SIM sweep → DEMO parchi (DECISIONS G3).
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDict();
  return { title: `${t["try.title"]} · ${t["brand.name"]}` };
}

export default async function SandboxOrderPage({ params }: PageProps<"/try/[id]">) {
  const { id } = await params;
  return <TryOrder orderId={id} />;
}
