"use client";

// A live call's recording (DECISIONS B6; DESIGN §11 CallDetail, §12.7 item 5). Loaded lazily by the sweep
// panel and Result (next/dynamic), so the player stays out of /app's first load (DESIGN §20). The first tap
// asks media.recToken for a 10-minute link (the caller must own the order) and plays /rec/<callId> from the
// Convex site. Rendered only for live calls with a stored recording; sim calls have none (no fake audio).
import { useMutation } from "convex/react";
import { useCallback } from "react";
import { RecordingPlayer } from "@/components/mb/RecordingPlayer";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useT } from "@/lib/i18n/useT";

export function CallRecording({ callId, variant, durationS, title, meta }: { callId: string; variant: "panel" | "row"; durationS?: number; title?: string; meta?: string }) {
  const { t } = useT();
  const recToken = useMutation(api.media.recToken);
  const load = useCallback(() => recToken({ callId: callId as Id<"calls"> }), [recToken, callId]);
  return (
    <RecordingPlayer
      load={load}
      variant={variant}
      durationHintS={durationS}
      title={title}
      meta={meta}
      labels={{ play: t("call.play"), pause: t("call.pause"), seek: t("call.seek"), listen: t("result.listen"), loading: t("rec.loading"), error: t("rec.error") }}
    />
  );
}
