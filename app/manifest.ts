import type { MetadataRoute } from "next";
import { LIGHT } from "@/lib/tokens";

// PWA scope is /app only (DECISIONS F1, DESIGN §20). Icons from scripts/icons.ts (DESIGN §4).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Molbhav",
    short_name: "मोलभाव",
    start_url: "/app",
    scope: "/app",
    display: "standalone",
    theme_color: LIGHT.paper,
    background_color: LIGHT.paper,
    lang: "hi",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
