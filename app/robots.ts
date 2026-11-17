import type { MetadataRoute } from "next";

// Phase 1C: the landing page, the dealer opt-in and the privacy notice are public; the app, the sandbox, shared
// parchis (also noindex), the presenter view, the styleguide and the API are not. "/p/" keeps its slash so the
// rule can't also match /privacy or /present by prefix. Checked in features/marketing/robots.test.ts.
export default function robots(): MetadataRoute.Robots {
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
