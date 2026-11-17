import type { ReactNode } from "react";

// Desk (≥1024, DESIGN §19): on screens whose next step is one button (Confirm, Choose dealers, Result), that
// action takes the voice dock's place and stays in view at the bottom of the main column, so a long table never
// hides it. The phone keeps it in its bottom dock (one-handed), so this bar is desk-only.
export function DeskActionBar({ children }: { children: ReactNode }) {
  return <div className="sticky bottom-0 z-10 -mx-6 mt-auto hidden border-t border-rule bg-paper px-6 py-4 lg:block">{children}</div>;
}
