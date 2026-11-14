import type { MetadataRoute } from "next";

// PWA scope is /app only (DECISIONS F1, DESIGN §20). Icons arrive with the brand assets in Phase 1B.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Molbhav",
    short_name: "मोलभाव",
    start_url: "/app",
    scope: "/app",
    display: "standalone",
    theme_color: "#F6F2E9",
    background_color: "#F6F2E9",
    lang: "hi",
  };
}
