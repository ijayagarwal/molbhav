// ModeBadge (DESIGN §11): "DEMO" (cement fill) in sim mode on every screen and dealer; "LIVE" (lal outline) in live.
export function ModeBadge({ mode, label }: { mode: "sim" | "live"; label: string }) {
  return mode === "sim" ? (
    <span className="inline-flex h-6 items-center rounded-parchi bg-cement px-2 font-mono text-meta text-ink-2">{label}</span>
  ) : (
    <span className="inline-flex h-6 items-center rounded-parchi border border-lal px-2 font-mono text-meta text-lal">{label}</span>
  );
}
