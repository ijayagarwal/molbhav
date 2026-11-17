import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components stays off: Convex Auth reads its cookies in the product layout and
  // F8 sets <html lang> from a cookie on the server, both of which Cache Components only
  // allows behind <Suspense>. Data is realtime from Convex, so there is little to prerender.
  cacheComponents: false,
  // Phone testing through the cloudflared tunnel (CLAUDE.md, F9).
  allowedDevOrigins: ["*.trycloudflare.com"],
  poweredByHeader: false,
  // The shared parchi's preview image needs @vercel/og's HarfBuzz wasm (supplied by scripts/og-wasm.mjs) and
  // the static TTFs; both are read at runtime by path, so tracing can't find them on its own.
  outputFileTracingIncludes: {
    "/p/[publicId]/opengraph-image": ["./node_modules/@vercel/og/dist/hb.wasm", "./assets/og/*.ttf"],
  },
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
