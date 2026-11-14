// HMAC-SHA256 of IPs and phone numbers with HASH_SECRET (DECISIONS B10).
// Web Crypto, so it runs in the Convex runtime. lib/server/hash.ts is the Node twin
// for Next.js server code; both give the same hex digest for the same input.

export async function hmacSha256Hex(secret: string, value: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(value));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** HMAC with the deployment's HASH_SECRET. Throws if the secret isn't set, so nothing is ever stored unkeyed. */
export async function hashWithSecret(value: string): Promise<string> {
  const secret = process.env.HASH_SECRET;
  if (!secret) throw new Error("HASH_SECRET is not set on this Convex deployment");
  return await hmacSha256Hex(secret, value);
}
