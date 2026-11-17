import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import type { Metadata } from "next";
import { MotionRoot } from "@/components/mb/MotionRoot";
import { ServiceWorker } from "@/features/app/ServiceWorker";
import { ConvexClientProvider } from "./ConvexClientProvider";

// Product surfaces are never indexed (they hold sessions and private data).
export const metadata: Metadata = { robots: { index: false, follow: false } };

// The product surfaces (/app, /try, /present, /styleguide) get the Convex Auth + Convex providers (DECISIONS F2).
export default function ProductLayout({ children }: { children: React.ReactNode }) {
  return (
    <ConvexAuthNextjsServerProvider>
      <ConvexClientProvider>
        {/* Every m.* element (prices on the board, captions, strikes, the tally) needs LazyMotion's features;
            without them they stay at their initial style, invisible (F7). */}
        <MotionRoot>{children}</MotionRoot>
        <ServiceWorker />
      </ConvexClientProvider>
    </ConvexAuthNextjsServerProvider>
  );
}
