import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components stays off: Convex Auth reads its cookies in the product layout and
  // F8 sets <html lang> from a cookie on the server, both of which Cache Components only
  // allows behind <Suspense>. Data is realtime from Convex, so there is little to prerender.
  cacheComponents: false,
  // Phone testing through the cloudflared tunnel (CLAUDE.md, F9).
  allowedDevOrigins: ["*.trycloudflare.com"],
  poweredByHeader: false,
  // The shared parchi's image (/p/<id>/opengraph-image-<hash> and /p/<id>/parchi.png) needs @vercel/og 1.0.3's
  // HarfBuzz shaping for Devanagari. Two traps, both of which silently render unshaped Hindi ("अग्‌रवाल"):
  // - Next.js aliases the import "@vercel/og" to its own bundled copy (1.0.1, no HarfBuzz), so 1.0.3 is
  //   installed under the npm alias "vercel-og" (package.json) and imported by that name.
  // - harfbuzzjs reads hb.wasm from its own package folder at runtime (scripts/og-wasm.mjs puts it there), so
  //   the package loads unbundled from node_modules (serverExternalPackages). Its CommonJS glue (require("fs"),
  //   __dirname) fails as an ES module, so patches/@vercel__og@1.0.3.patch swaps in the module's own fs import
  //   and import.meta.url. Tracing can't see the wasm read, nor the static TTFs, so both are included here.
  serverExternalPackages: ["vercel-og"],
  outputFileTracingIncludes: {
    "/p/**": ["./node_modules/vercel-og/dist/hb.wasm", "./assets/og/*.ttf"],
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
