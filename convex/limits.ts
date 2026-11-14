// Rate limits (@convex-dev/rate-limiter). Not public functions: this module only exports the limiter.
import { HOUR, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  // New anonymous accounts across the whole deployment (review of 1A: a script could otherwise
  // create users without bound straight against the Convex URL, skipping Vercel and BotID).
  anonSignUp: { kind: "token bucket", rate: 300, period: HOUR, capacity: 60 },
});
