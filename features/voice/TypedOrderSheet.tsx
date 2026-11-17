"use client";

// The typed fallback (DESIGN §12.2 "लिख के बताइए", §11 TranscriptCard "ठीक कीजिए"): a sheet with a text box
// that sends JSON { text } to POST /api/voice/order (no STT; the text comes back as the transcript), then
// goes to Confirm. Opened with a draft's transcript it is the fix: the new draft replaces the old one, which
// the new Confirm cancels once it has mounted (lib/client/handoff.ts). Mount it only while open.
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { BottomSheet } from "@/components/mb/AppShell";
import { PrimaryButton, SecondaryButton } from "@/components/mb/Buttons";
import { SendBold } from "@/components/mb/icons";
import { markReplaces } from "@/lib/client/handoff";
import { problemCopy } from "@/lib/client/voiceErrors";
import { useT } from "@/lib/i18n/useT";
import { useOrderRequest } from "./useOrderRequest";

/** The route's limit for typed orders (lib/server/voiceOrder.ts VOICE_LIMITS.maxTypedChars). */
const MAX_CHARS = 500;

interface Props {
  title: string;
  onClose: () => void;
  initialText?: string;
  hint?: string;
  /** The draft this order replaces (the fix on Confirm). */
  replaces?: string;
}

export function TypedOrderSheet({ title, onClose, initialText = "", hint, replaces }: Props) {
  const { t } = useT();
  const router = useRouter();
  const [text, setText] = useState(initialText);
  const request = useOrderRequest({
    onDraft: (orderId) => {
      if (replaces) markReplaces(orderId, replaces);
      const path = `/app/order/${orderId}/confirm`;
      if (replaces) router.replace(path);
      else router.push(path);
    },
  });
  const s = request.state;
  const copy = s.phase === "error" ? problemCopy(s.problem, { noisy: s.noisy }) : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const clean = text.trim();
    if (clean === "" || request.busy) return;
    void request.send({ kind: "text", text: clean });
  };

  return (
    <BottomSheet open title={title} onClose={onClose} closeLabel={t("panel.close")}>
      {hint ? <p className="text-body text-ink-2">{hint}</p> : null}
      <form onSubmit={submit} className="flex flex-col gap-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("dock.placeholder")}
          aria-label={title}
          maxLength={MAX_CHARS}
          rows={3}
          enterKeyHint="send"
          autoComplete="off"
          disabled={request.busy}
          className="min-h-28 w-full resize-none rounded-card border-[1.5px] border-ink bg-card px-4 py-3 text-body placeholder:text-ink-3 disabled:text-ink-2"
        />
        {copy ? (
          <div role="alert" className="flex flex-col gap-3 rounded-card border-[1.5px] border-lal bg-card px-4 py-3">
            <p className="text-label text-lal">{t(copy.key)}</p>
            {copy.retry === "reload" ? (
              <SecondaryButton onClick={() => window.location.reload()}>{t("error.retry")}</SecondaryButton>
            ) : null}
          </div>
        ) : null}
        <PrimaryButton type="submit" size="md" icon={<SendBold className="size-5" />} disabled={text.trim() === "" || request.busy} aria-busy={request.busy}>
          {request.busy ? t("listen.processing") : copy && copy.retry === "resend" ? t("error.retry") : t("listen.send")}
        </PrimaryButton>
      </form>
    </BottomSheet>
  );
}
