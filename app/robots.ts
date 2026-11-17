import type { MetadataRoute } from "next";

// Phase 1C: the landing page, the dealer opt-in and the privacy notice are public; the app, the sandbox, shared
// parchis (also noindex), the presenter view, the styleguide and the API are not. "/p/" keeps its slash so the
// rule can't also match /privacy or /present by prefix. Checked in features/marketing/robots.test.ts.
//
// Search engines are let in only at launch (PUBLIC_LAUNCH=true on Vercel): PROMPTS 1C asks for a lawyer's read of
// /privacy and the consent text before the landing link is shared publicly. Until then every crawler is kept out.
export function launchRobots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/dealer", "/privacy"],
        disallow: ["/app", "/try", "/p/", "/present", "/styleguide", "/api/"],
      },
    ],
  };
}

export default function robots(): MetadataRoute.Robots {
  if (process.env.PUBLIC_LAUNCH === "true") return launchRobots();
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
