"use client";

// /app/admin/dealers (DECISIONS R24, R26): one page, two views. "Applications" is the /dealer review panel
// (DealerApplications, unchanged); "All dealers" is the directory of every dealers row (DealerDirectory). The
// view is a segmented switch; ?view=all (and ?status=…, from the overview's tiles) opens the directory, and the
// switch keeps the address in step so a reload or a shared link lands on the same view.
import { useConvexAuth, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { DealerStatusFilter } from "@/lib/dealerStatus";
import type { DictKey } from "@/lib/i18n/hi";
import { useT } from "@/lib/i18n/useT";
import { AdminNav } from "./AdminNav";
import { DealerApplications } from "./DealerAppsPanel";
import { DealerDirectory } from "./DealerDirectory";

export type DealersView = "apps" | "all";

const VIEWS: readonly { view: DealersView; label: DictKey; intro: DictKey }[] = [
  { view: "apps", label: "adminDealers.viewApps", intro: "adminDealers.introApps" },
  { view: "all", label: "adminDealers.viewAll", intro: "adminDealers.introAll" },
];

/** Puts the view in the address bar without a navigation (Next keeps its router in step with history). */
function syncUrl(view: DealersView) {
  try {
    const url = new URL(window.location.href);
    if (view === "all") url.searchParams.set("view", "all");
    else url.searchParams.delete("view");
    url.searchParams.delete("status");
    window.history.replaceState(window.history.state, "", url);
  } catch {
    // An old browser or a sandboxed frame: the view still switches, only the address stays.
  }
}

export function DealersAdmin({ initialView, initialStatus }: { initialView: DealersView; initialStatus?: DealerStatusFilter }) {
  const { t } = useT();
  const { isLoading } = useConvexAuth();
  const isAdmin = useQuery(api.admin.amIAdmin, isLoading ? "skip" : {});
  const [view, setView] = useState<DealersView>(initialView);
  const current = VIEWS.find((v) => v.view === view) ?? VIEWS[0];

  return (
    <main className="mx-auto flex max-w-[1240px] flex-col gap-4 px-4 py-8 sm:px-5 lg:px-8">
      <AdminNav />
      <h1 className="font-display text-title-1">{t("adminDealers.title")}</h1>
      {isAdmin === undefined ? (
        <p className="text-body text-ink-2">{t("admin.loading")}</p>
      ) : isAdmin ? (
        <>
          <div role="tablist" aria-label={t("adminDealers.viewLabel")} className="grid w-full grid-cols-2 gap-1 rounded-card border-[1.5px] border-ink bg-card p-1 sm:w-fit">
            {VIEWS.map((v) => (
              <button
                key={v.view}
                id={`dealers-view-${v.view}`}
                type="button"
                role="tab"
                aria-selected={view === v.view}
                aria-controls="dealers-view-panel"
                onClick={() => {
                  setView(v.view);
                  syncUrl(v.view);
                }}
                className="min-h-14 rounded-card px-4 text-label aria-selected:bg-ink aria-selected:text-paper sm:px-6"
              >
                {t(v.label)}
              </button>
            ))}
          </div>
          <div role="tabpanel" id="dealers-view-panel" aria-labelledby={`dealers-view-${view}`} className="flex flex-col gap-4">
            <p className="max-w-[72ch] text-meta text-ink-2">{t(current.intro)}</p>
            {view === "apps" ? <DealerApplications /> : <DealerDirectory initialStatus={initialStatus} />}
          </div>
        </>
      ) : (
        <p role="alert" className="text-body text-ink-2">
          {t("admin.notAllowed")}
        </p>
      )}
    </main>
  );
}
