import { isAdminRequest } from "@/features/admin/adminServer";
import { DealersAdmin } from "@/features/admin/DealersAdmin";
import { DEALER_STATUS_FILTERS, type DealerStatusFilter } from "@/lib/dealerStatus";
import { getServerDict } from "@/lib/i18n/server";

// /app/admin/dealers (DECISIONS R24, R26): the founders review /dealer applications and approve, restrict or
// re-allow ("Applications"), and see, add, restrict and re-allow every dealer ("All dealers", ?view=all).
// Admins only: checked here on the server first, then again by every dealerApps.* and adminDealers.* function.
export default async function AdminDealersPage({ searchParams }: PageProps<"/app/admin/dealers">) {
  if ((await isAdminRequest()) === false) {
    const { t } = await getServerDict();
    return (
      <main className="mx-auto flex max-w-[640px] flex-col gap-4 px-4 py-10">
        <h1 className="font-display text-title-1">{t["adminDealers.title"]}</h1>
        <p role="alert" className="text-body text-ink-2">
          {t["admin.notAllowed"]}
        </p>
      </main>
    );
  }
  const params = await searchParams;
  const view = params.view === "all" ? "all" : "apps";
  const rawStatus = typeof params.status === "string" ? params.status : undefined;
  const status = (DEALER_STATUS_FILTERS as readonly string[]).includes(rawStatus ?? "") ? (rawStatus as DealerStatusFilter) : undefined;
  return <DealersAdmin initialView={status !== undefined ? "all" : view} initialStatus={status} />;
}
