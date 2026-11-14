import type { MetadataRoute } from "next";

// Pre-launch: nothing is indexed until Phase 1C ships the real landing page and privacy notice.
// Phase 1C switches to: allow /, /dealer, /privacy; disallow /app, /try, /p, /present, /styleguide.
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
