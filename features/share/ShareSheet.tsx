"use client";

// The share sheet (DESIGN §12.7, §21.3, ARCHITECTURE §6.10): pick who it's for (पूरी पर्ची / सिर्फ बचत / मुंशी
// के लिए), which makes the revocable link and fetches its preview PNG; then "WhatsApp पे भेजिए" shares the PNG
// with the link through the phone's share sheet (inside the tap), or falls back to a wa.me link.
import { useMutation } from "convex/react";
import { useState } from "react";
import { BottomSheet } from "@/components/mb/AppShell";
import { PrimaryButton } from "@/components/mb/Buttons";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { DictKey } from "@/lib/i18n/getDict";
import { useT } from "@/lib/i18n/useT";

type Mode = "full" | "savings" | "munshi";
const MODES: { mode: Mode; label: DictKey; hint: DictKey }[] = [
  { mode: "full", label: "share.full", hint: "share.fullHint" },
  { mode: "savings", label: "share.savings", hint: "share.savingsHint" },
  { mode: "munshi", label: "share.munshi", hint: "share.munshiHint" },
];

export function ShareSheet({ orderId, open, onClose }: { orderId: Id<"orders">; open: boolean; onClose: () => void }) {
  const { t } = useT();
  const create = useMutation(api.share.create);
  const [mode, setMode] = useState<Mode | null>(null);
  const [link, setLink] = useState<{ url: string; file: File | null } | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (m: Mode) => {
    setMode(m);
    setBusy(true);
    setLink(null);
    try {
      const publicId = await create({ orderId, mode: m });
      const url = `${window.location.origin}/p/${publicId}`;
      // Fetch the PNG now, so the share happens inside the next tap (navigator.share needs a fresh gesture).
      const png = await fetch(`/p/${publicId}/opengraph-image`).then((r) => (r.ok ? r.blob() : null)).catch(() => null);
      setLink({ url, file: png ? new File([png], "molbhav-parchi.png", { type: "image/png" }) : null });
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (!link) return;
    const text = t("share.message", { url: link.url });
    const data: ShareData = link.file ? { files: [link.file], text, url: link.url } : { text, url: link.url };
    if (navigator.canShare?.(data)) {
      await navigator.share(data).catch(() => undefined);
      return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };

  return (
    <BottomSheet open={open} title={t("share.title")} onClose={onClose} closeLabel={t("panel.close")}>
      <div role="radiogroup" aria-label={t("share.title")} className="flex flex-col gap-2">
        {MODES.map((m) => (
          <button
            key={m.mode}
            type="button"
            role="radio"
            aria-checked={mode === m.mode}
            onClick={() => void pick(m.mode)}
            className={`flex min-h-16 flex-col items-start justify-center rounded-card border-2 px-4 py-2 text-left ${mode === m.mode ? "border-ink bg-ink text-paper" : "border-ink bg-card"}`}
          >
            <span className="font-display text-title-2">{t(m.label)}</span>
            <span className={`text-meta ${mode === m.mode ? "text-paper" : "text-ink-2"}`}>{t(m.hint)}</span>
          </button>
        ))}
      </div>
      <PrimaryButton onClick={() => void send()} disabled={!link || busy} aria-busy={busy}>
        {busy ? t("share.making") : t("share.send")}
      </PrimaryButton>
    </BottomSheet>
  );
}
