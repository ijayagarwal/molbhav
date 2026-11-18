import { isAdminRequest } from "@/features/admin/adminServer";
import { DealerAppsPanel } from "@/features/admin/DealerAppsPanel";
import { getServerDict } from "@/lib/i18n/server";

// /app/admin/dealers (DECISIONS R24): the founders review /dealer applications and approve, restrict or re-allow.
// Admins only: checked here on the server first, then again by every dealerApps.* function (requireAdmin).
export default async function AdminDealersPage() {
  if ((await isAdminRequest()) === false) {
    const { t } = await getServerDict();
    return (
      <main className="mx-auto flex max-w-[640px] flex-col gap-4 px-4 py-10">
        <h1 className="font-display text-title-1">{t["admin.dealersTitle"]}</h1>
        <p role="alert" className="text-body text-ink-2">
          {t["admin.notAllowed"]}
        </p>
      </main>
    );
  }
  return <DealerAppsPanel />;
}
