import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components stays off: Convex Auth reads its cookies in the product layout and
  // F8 sets <html lang> from a cookie on the server, both of which Cache Components only
  // allows behind <Suspense>. Data is realtime from Convex, so there is little to prerender.
  cacheComponents: false,
  // Phone testing through the cloudflared tunnel (CLAUDE.md, F9).
  allowedDevOrigins: ["*.trycloudflare.com"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
