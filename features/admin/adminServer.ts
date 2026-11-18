import "server-only";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";

/**
 * Whether this request's session is an admin (admin.amIAdmin, ADMIN_USER_IDS), asked on the server before an
 * admin page renders (R24). null when it can't be asked (no Convex URL, network): the page then falls back to the
 * client check. Either way every admin query and mutation checks requireAdmin again in Convex.
 */
export async function isAdminRequest(): Promise<boolean | null> {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) return null;
  try {
    const token = await convexAuthNextjsToken();
    if (!token) return false;
    return await fetchQuery(api.admin.amIAdmin, {}, { token });
  } catch {
    return null;
  }
}
