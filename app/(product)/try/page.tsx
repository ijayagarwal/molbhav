import type { Metadata } from "next";
import { TryHome } from "@/features/try/TryHome";
import { getServerDict } from "@/lib/i18n/server";

// /try: the sandbox (DECISIONS G3, DESIGN §21.2, ARCHITECTURE §6.9). Sim only, fictional dealers.
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDict();
  return { title: `${t["try.title"]} · ${t["brand.name"]}` };
}

export default function SandboxPage() {
  return <TryHome />;
}
