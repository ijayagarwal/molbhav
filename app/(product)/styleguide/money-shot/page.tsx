import { MotionRoot } from "@/components/mb/MotionRoot";
import { Wordmark } from "@/components/mb/Wordmark";
import { MoneyShot } from "@/features/moneyShot/MoneyShot";
import { getServerDict } from "@/lib/i18n/server";

// Phase 2A, the design quality gate (D8): the 20-second money shot with production fonts and sound.
// Review on a ₹12k Android at noon and on a 1440 px screen before building screens.
export default async function MoneyShotPage() {
  const { t } = await getServerDict();
  return (
    <main className="mx-auto flex max-w-[1240px] flex-col gap-6 px-4 py-8 sm:px-5 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <Wordmark label={t["brand.name"]} height={36} />
        <h1 className="text-label text-ink-2">{t["moneyShot.title"]}</h1>
      </header>
      <MotionRoot>
        <MoneyShot />
      </MotionRoot>
    </main>
  );
}
