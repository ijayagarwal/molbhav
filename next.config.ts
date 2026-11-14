import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components stays off: Convex Auth reads its cookies in the product layout and
  // F8 sets <html lang> from a cookie on the server, both of which Cache Components only
  // allows behind <Suspense>. Data is realtime from Convex, so there is little to prerender.
  cacheComponents: false,
  // Phone testing through the cloudflared tunnel (CLAUDE.md, F9).
  allowedDevOrigins: ["*.trycloudflare.com"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Same-origin framing only: /present frames /app (B8); nobody else may (clickjacking on place/confirm).
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=(), payment=()" },
        ],
      },
    ];
  },
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
