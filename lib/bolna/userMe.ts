// GET /user/me (https://www.bolna.ai/docs/api-reference/user/info): the account's wallet balance and its call
// concurrency limit, for the founders' overview (adminStats.bolnaWallet, R26). Defensive: anything missing or
// not a number comes back null. Pure.

export interface BolnaUserMe {
  /** The wallet balance as Bolna reports it (Bolna bills in US dollars; call costs arrive in US cents). */
  wallet: number | null;
  /** How many calls may run at once on this account (the trial allows 2). */
  concurrency: number | null;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim())) return Number(value.trim());
  return null;
}

function isObj(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseUserMe(raw: unknown): BolnaUserMe {
  if (!isObj(raw)) return { wallet: null, concurrency: null };
  const concurrency = isObj(raw.concurrency) ? num(raw.concurrency.max) : num(raw.concurrency);
  return { wallet: num(raw.wallet), concurrency };
}
