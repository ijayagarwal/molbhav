import type { Metadata, Viewport } from "next";
import { getLang } from "@/lib/i18n/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "Molbhav · मोलभाव",
  description: "आप बोलिए। मोलभाव हम करेंगे। · You say it. We bargain.",
};

export const viewport: Viewport = {
  themeColor: "#F6F2E9",
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

// No Convex client here: the marketing pages stay server-only (DECISIONS F2).
// The Convex providers live in app/(product)/layout.tsx.
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const lang = await getLang();
  return (
    <html lang={lang} className="h-full">
      <body className="min-h-full bg-paper text-ink antialiased">{children}</body>
    </html>
  );
}
