import type { Metadata, Viewport } from "next";
import { getServerDict } from "@/lib/i18n/server";
import { I18nProvider } from "@/lib/i18n/useT";
import { LIGHT } from "@/lib/tokens";
import { fontVariables } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Molbhav · मोलभाव",
  description: "आप बोलिए। मोलभाव हम करेंगे। · You say it. We bargain.",
};

export const viewport: Viewport = {
  themeColor: LIGHT.paper,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

// No Convex client here: the marketing pages stay server-only (DECISIONS F2).
// The Convex providers live in app/(product)/layout.tsx. <html lang> comes from the lang cookie (F8).
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { lang, t } = await getServerDict();
  return (
    <html lang={lang} className={`h-full ${fontVariables}`}>
      <body className="min-h-full bg-paper text-ink antialiased">
        <I18nProvider lang={lang} dict={t}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
