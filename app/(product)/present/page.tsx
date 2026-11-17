import type { Metadata } from "next";
import { Presenter } from "@/features/present/Presenter";
import { getServerDict } from "@/lib/i18n/server";

// /present: the presenter view for the judge demo (DECISIONS B8, DESIGN §12.9, docs/DEMO.md). Admins only.
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDict();
  return { title: `${t["present.title"]} · ${t["brand.name"]}` };
}

export default function PresentPage() {
  return <Presenter />;
}
