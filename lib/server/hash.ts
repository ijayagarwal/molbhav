import "server-only";
import { createHmac } from "node:crypto";

// HMAC-SHA256 of IPs and phone numbers with HASH_SECRET (DECISIONS B10), for Next.js server code.
// Same digest as convex/lib/hash.ts for the same input.

export function hmacSha256HexNode(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value, "utf8").digest("hex");
}

export function hashWithSecret(value: string): string {
  const secret = process.env.HASH_SECRET;
  if (!secret) throw new Error("HASH_SECRET is not set");
  return hmacSha256HexNode(secret, value);
}
