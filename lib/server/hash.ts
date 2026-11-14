import "server-only";
import { createHmac } from "node:crypto";
import { isIndianMobileE164 } from "../phone";

// HMAC-SHA256 of IPs and phone numbers with HASH_SECRET (DECISIONS B10), for Next.js server code.
// Same domain tags and digests as convex/lib/hash.ts.

export function hmacSha256HexNode(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value, "utf8").digest("hex");
}

function hashSecret(): string {
  const secret = process.env.HASH_SECRET;
  if (!secret) throw new Error("HASH_SECRET is not set");
  return secret;
}

export function hashPhone(e164: string): string {
  if (!isIndianMobileE164(e164)) throw new Error("hashPhone needs a canonical +91 mobile number");
  return hmacSha256HexNode(hashSecret(), `phone:${e164}`);
}

export function hashIp(ip: string): string {
  return hmacSha256HexNode(hashSecret(), `ip:${ip.trim()}`);
}
