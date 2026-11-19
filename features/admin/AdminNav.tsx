"use client";

// The founders' admin area (DECISIONS R26): one bar of tabs on every admin page — Overview, Users, Dealers,
// Agents — plus a way back to the app. 56 px targets, the current page marked with aria-current.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BackBold } from "@/components/mb/icons";
import type { DictKey } from "@/lib/i18n/hi";
import { useT } from "@/lib/i18n/useT";

const TABS: readonly { href: string; label: DictKey; exact?: boolean }[] = [
  { href: "/app/admin", label: "adminNav.overview", exact: true },
  { href: "/app/admin/users", label: "adminNav.users" },
  { href: "/app/admin/dealers", label: "adminNav.dealers" },
  { href: "/app/admin/agents", label: "adminNav.agents" },
];

export function AdminNav() {
  const { t } = useT();
  const pathname = usePathname() ?? "";
  return (
    <nav aria-label={t("adminNav.label")} className="flex flex-col gap-3">
      <Link href="/app" className="-my-2 inline-flex min-h-14 w-fit items-center gap-2 text-label text-neel underline underline-offset-4">
        <BackBold aria-hidden="true" className="size-5" />
        {t("adminNav.backToApp")}
      </Link>
      <ul className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {TABS.map((tab) => {
          const current = tab.exact ? pathname === tab.href : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={current ? "page" : undefined}
                className="flex min-h-14 items-center justify-center rounded-card border-[1.5px] border-ink bg-card px-4 text-label aria-[current=page]:bg-ink aria-[current=page]:text-paper"
              >
                {t(tab.label)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
