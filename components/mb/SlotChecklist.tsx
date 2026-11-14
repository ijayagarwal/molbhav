import { CheckBold } from "./icons";

// SlotChecklist (DESIGN §11): four small chips, रेट · GST · भाड़ा · उधार, ✓ when known. Both modes (D7):
// live fills it from report_quote (provisional) and then from extraction.
export interface Slots {
  rate: boolean;
  gst: boolean;
  delivery: boolean;
  credit: boolean;
}

export function SlotChecklist({ slots, labels }: { slots: Slots; labels: Record<keyof Slots, string> }) {
  const order: (keyof Slots)[] = ["rate", "gst", "delivery", "credit"];
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={order.map((k) => labels[k]).join(", ")}>
      {order.map((k) => (
        <li
          key={k}
          className={`inline-flex h-7 items-center gap-1 rounded-card border px-2 text-label ${slots[k] ? "border-ink bg-card text-ink" : "border-rule bg-card text-ink-3"}`}
          aria-checked={slots[k]}
          role="checkbox"
        >
          {slots[k] ? <CheckBold className="size-3.5" /> : <span aria-hidden="true" className="size-1.5 rounded-full bg-ink-3" />}
          {labels[k]}
        </li>
      ))}
    </ul>
  );
}
