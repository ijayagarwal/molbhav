// The signed-in person's own account (DECISIONS R26): who they are (Google), what the founders decided
// (approved / pending / blocked) and their profile. /app decides what to show from `me`; the founders change
// access in the admin panel (adminUsers.ts). Nothing here can approve anyone.
import { ConvexError, v } from "convex/values";
import { normaliseContractorName } from "../lib/names";
import { normaliseIndianMobile } from "../lib/phone";
import { cleanAddress } from "../lib/profile";
import { internalMutation, internalQuery } from "./_generated/server";
import { audit } from "./lib/audit";
import { accessOf, contractorForUser, isAdminUser as isAdminUserDoc } from "./lib/access";
import { optionalUserQuery, userMutation } from "./lib/functions";

/**
 * The caller's account, or null when signed out. A blocked person gets `access: "blocked"` and nothing else of
 * use. The profile phone is the caller's own (shown back to them only).
 */
export const me = optionalUserQuery({
  args: {},
  handler: async (ctx) => {
    if (ctx.userId === null) return null;
    const user = await ctx.db.get(ctx.userId);
    if (user === null) return null;
    const access = accessOf(user);
    const contractor = access === "blocked" ? null : await contractorForUser(ctx, user._id);
    return {
      email: user.email ?? null,
      googleName: user.name ?? null,
      image: user.image ?? null,
      /** An old anonymous session (before R26): it has to sign in with Google to go on, unless already approved. */
      anonymous: user.isAnonymous === true || user.email === undefined,
      access,
      isAdmin: isAdminUserDoc(user),
      profile:
        contractor === null
          ? null
          : {
              name: contractor.name,
              phone: contractor.profilePhoneE164 ?? contractor.phoneE164 ?? null,
              address: contractor.address ?? null,
              verified: contractor.verified,
            },
    };
  },
});

/** Admin check for actions and HTTP actions (they have no ctx.db). */
export const isAdminUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => isAdminUserDoc(await ctx.db.get(userId)),
});

/**
 * Edits the caller's own profile (pending or approved). A verified contractor's name and phone are locked (S1:
 * the founders checked them on a call); the address can always change.
 */
export const saveProfile = userMutation({
  args: { name: v.string(), phone: v.string(), address: v.string() },
  handler: async (ctx, args) => {
    const c = await contractorForUser(ctx, ctx.userId);
    if (c === null) throw new ConvexError({ code: "no_contractor" });
    const address = cleanAddress(args.address);
    if (address === null) throw new ConvexError({ code: "invalid_address" });
    if (c.verified) {
      await ctx.db.patch(c._id, { address });
      return { locked: true };
    }
    const name = normaliseContractorName(args.name);
    if (name === null) throw new ConvexError({ code: "invalid_name" });
    const profilePhoneE164 = normaliseIndianMobile(args.phone);
    if (profilePhoneE164 === null) throw new ConvexError({ code: "invalid_phone" });
    await ctx.db.patch(c._id, { name, profilePhoneE164, address });
    return { locked: false };
  },
});

/**
 * One-off, per deployment, when R26 lands: people the founders already trusted keep using the app. Approves the
 * user of every verified contractor; everyone else starts pending. Idempotent; audit-logged.
 * `npx convex run account:approveVerifiedContractors '{"actor":"claude"}'`
 */
export const approveVerifiedContractors = internalMutation({
  args: { actor: v.string() },
  handler: async (ctx, { actor }) => {
    if (!/^[a-z][a-z0-9_-]{1,31}$/i.test(actor)) throw new ConvexError({ code: "invalid_actor" });
    const contractors = (await ctx.db.query("contractors").collect()).filter((c) => c.verified && c.isDemo !== true);
    let approved = 0;
    for (const c of contractors) {
      const user = await ctx.db.get(c.userId);
      if (user === null || user.access !== undefined) continue;
      await ctx.db.patch(user._id, { access: "approved", accessChangedAt: Date.now(), accessChangedBy: `cli:${actor}` });
      approved++;
    }
    await audit(ctx, `cli:${actor}`, "access.approve_verified", "users", { approved });
    return { approved };
  },
});
