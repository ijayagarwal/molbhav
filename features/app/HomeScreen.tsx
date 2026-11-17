"use client";

// /app (DESIGN §12.1, §12.2): onboarding for a new device, then Home. Each loads on demand, so a first-time
// visitor's first load carries only onboarding and a returning one's only Home (DESIGN §20: /app under 200 KB).
import { useQuery } from "convex/react";
import dynamic from "next/dynamic";
import { api } from "@/convex/_generated/api";

function Skeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-4 pt-2">
      {[48, 64, 160, 40, 40].map((h, i) => (
        <span key={i} className="block rounded-card bg-cement" style={{ height: h }} />
      ))}
    </div>
  );
}

function Loading() {
  return (
    <main className="mx-auto w-full max-w-[640px] px-4 py-6" aria-busy="true">
      <Skeleton />
    </main>
  );
}

const Onboarding = dynamic(() => import("./Onboarding").then((m) => m.Onboarding), { loading: Loading });
const HomeBody = dynamic(() => import("./HomeBody").then((m) => m.HomeBody), { loading: Loading });

export function HomeScreen() {
  const me = useQuery(api.contractors.me, {});
  if (me === undefined) return <Loading />;
  if (me === null) return <Onboarding />;
  return <HomeBody me={me} />;
}
