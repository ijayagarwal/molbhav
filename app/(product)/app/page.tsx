import { getServerDict } from "@/lib/i18n/server";
import { AnonymousSession } from "./AnonymousSession";

// /app home. Phase 4 builds the real Home (DESIGN §12.2); for now it proves the anonymous session.
export default async function AppHome() {
  const { t } = await getServerDict();
  return (
    <main className="mx-auto flex min-h-dvh max-w-[640px] flex-col gap-4 px-4 py-10">
      <h1 className="text-[28px] font-bold leading-[36px]">{t["brand.name"]}</h1>
      <AnonymousSession
        labels={{ connecting: t["session.connecting"], ready: t["session.ready"], error: t["session.error"] }}
      />
    </main>
  );
}
