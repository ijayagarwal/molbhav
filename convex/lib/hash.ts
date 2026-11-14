// HMAC-SHA256 of IPs and phone numbers with HASH_SECRET (DECISIONS B10), in the Convex runtime
// (Web Crypto). lib/server/hash.ts is the Node twin for Next.js server code; both give the same
// digest for the same input. Inputs are domain-tagged ("phone:", "ip:", "demo:") so a phone hash
// can never equal an IP hash.
import { isIndianMobileE164 } from "../../lib/phone";

export async function hmacSha256Hex(secret: string, value: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(value));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

function hashSecret(): string {
  const secret = process.env.HASH_SECRET;
  if (!secret) throw new Error("HASH_SECRET is not set on this Convex deployment");
  return secret;
}

/** Hash of a canonical +91 mobile number (normalise it with lib/phone.ts first). */
export async function hashPhone(e164: string): Promise<string> {
  if (!isIndianMobileE164(e164)) throw new Error("hashPhone needs a canonical +91 mobile number");
  return await hmacSha256Hex(hashSecret(), `phone:${e164}`);
}

/** Hash of a client IP address (rate-limit keys, waitlist). */
export async function hashIp(ip: string): Promise<string> {
  return await hmacSha256Hex(hashSecret(), `ip:${ip.trim()}`);
}

/** Hash for seeded demo dealers, whose numbers are deliberately invalid (+9100000000NN, B10). */
export async function hashDemoPhone(fakeNumber: string): Promise<string> {
  return await hmacSha256Hex(hashSecret(), `demo:${fakeNumber}`);
}
