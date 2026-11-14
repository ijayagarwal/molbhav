import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import type { Metadata } from "next";
import { ConvexClientProvider } from "./ConvexClientProvider";

// Product surfaces are never indexed (they hold sessions and private data).
export const metadata: Metadata = { robots: { index: false, follow: false } };

// The product surfaces (/app, /try, /present, /styleguide) get the Convex Auth + Convex providers (DECISIONS F2).
export default function ProductLayout({ children }: { children: React.ReactNode }) {
  return (
    <ConvexAuthNextjsServerProvider>
      <ConvexClientProvider>{children}</ConvexClientProvider>
    </ConvexAuthNextjsServerProvider>
  );
}
