// Funnel analytics (DECISIONS G6, ARCHITECTURE §6.13): the event names we accept and the only props each
// may carry. Props are short enum values from fixed lists, never free text, so no name, phone number,
// link id or order detail can reach the events table. convex/events.ts enforces this; the client beacon
// (features/marketing/beacon.ts) and the server helpers use the same types. Pure, no React.

const SHARE_MODES = ["full", "savings", "munshi"] as const;

/** Each event's allowed props: key → the values it may take. An event with `{}` takes no props. */
export const EVENT_PROPS = {
  try_start: {},
  try_voice: {},
  waitlist_submit: { role: ["contractor", "munshi", "other"], ref: ["none", "parchi", "other"] },
  dealer_optin: {},
  parchi_share: { mode: SHARE_MODES },
  parchi_open: { mode: SHARE_MODES },
  parchi_cta: { mode: SHARE_MODES },
} as const satisfies Record<string, Record<string, readonly string[]>>;

export type EventName = keyof typeof EVENT_PROPS;
export const EVENT_NAMES = Object.keys(EVENT_PROPS) as EventName[];

type PropsOf<N extends EventName> = { [K in keyof (typeof EVENT_PROPS)[N]]?: (typeof EVENT_PROPS)[N][K] extends readonly (infer V)[] ? V : never };
export type EventProps<N extends EventName = EventName> = PropsOf<N>;

export function isEventName(value: unknown): value is EventName {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(EVENT_PROPS, value);
}

/**
 * The props as a canonical JSON string (keys sorted), `undefined` when there are none, or null when any key
 * or value isn't on the event's list.
 */
export function validateEventProps(name: EventName, props: unknown): string | undefined | null {
  if (props === undefined || props === null) return undefined;
  if (typeof props !== "object" || Array.isArray(props)) return null;
  const allowed = EVENT_PROPS[name] as Record<string, readonly string[]>;
  const entries = Object.entries(props as Record<string, unknown>);
  if (entries.length === 0) return undefined;
  for (const [key, value] of entries) {
    const values = Object.prototype.hasOwnProperty.call(allowed, key) ? allowed[key] : undefined;
    if (values === undefined || typeof value !== "string" || !values.includes(value)) return null;
  }
  return JSON.stringify(Object.fromEntries(entries.sort(([a], [b]) => (a < b ? -1 : 1))));
}

/**
 * The page an event came from, reduced to its route: the query string and fragment are dropped, and every
 * segment that isn't a short lowercase word (an order id, a share link's id) becomes "[id]", so a path
 * never carries a link someone could open. null when it isn't a site path at all.
 */
export function normaliseEventPath(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 300 || !raw.startsWith("/") || raw.startsWith("//")) return null;
  const pathname = raw.split(/[?#]/, 1)[0];
  const segments = pathname.split("/").filter((s) => s !== "");
  if (segments.length > 6) return null;
  const out = segments.map((s) => (/^[a-z]+(-[a-z]+)*$/.test(s) && s.length <= 16 ? s : "[id]"));
  return `/${out.join("/")}`;
}

/** The waitlist's `ref` (from the query string) reduced to a channel for the waitlist_submit event. */
export function refChannel(ref: string | undefined): "none" | "parchi" | "other" {
  if (ref === undefined || ref === "") return "none";
  return ref.startsWith("parchi") ? "parchi" : "other";
}
