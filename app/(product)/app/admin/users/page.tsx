import { isAdminRequest } from "@/features/admin/adminServer";
import { UsersPanel } from "@/features/admin/UsersPanel";
import { getServerDict } from "@/lib/i18n/server";

// /app/admin/users (DECISIONS R26): the founders see everyone who signed in, approve or block them, and allow
// real calls for a contractor after calling the number back. Admins only: checked here on the server first, then
// again by every adminUsers.* function (requireAdmin).
export default async function AdminUsersPage() {
  if ((await isAdminRequest()) === false) {
    const { t } = await getServerDict();
    return (
      <main className="mx-auto flex max-w-[640px] flex-col gap-4 px-4 py-10">
        <h1 className="font-display text-title-1">{t["adminUsers.title"]}</h1>
        <p role="alert" className="text-body text-ink-2">
          {t["admin.notAllowed"]}
        </p>
      </main>
    );
  }
  return <UsersPanel />;
}
