"use client";

// /app (DESIGN §12.1, §12.2, R26): Google sign-in, then onboarding, then the founders' approval, then Home.
// Each screen loads on demand, so a first-time visitor's first load carries only sign-in and a returning one's
// only Home (DESIGN §20: /app under 200 KB). account.me is reactive: an approval opens Home without a reload.
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
const SignInScreen = dynamic(() => import("./AccessScreens").then((m) => m.SignInScreen), { loading: Loading });
const PendingScreen = dynamic(() => import("./AccessScreens").then((m) => m.PendingScreen), { loading: Loading });
const BlockedScreen = dynamic(() => import("./AccessScreens").then((m) => m.BlockedScreen), { loading: Loading });

export function HomeScreen() {
  const account = useQuery(api.account.me, {});
  const approved = account !== undefined && account !== null && account.access === "approved" && account.profile !== null;
  const me = useQuery(api.contractors.me, approved ? {} : "skip");
  if (account === undefined) return <Loading />;
  if (account === null) return <SignInScreen />;
  if (account.access === "blocked") return <BlockedScreen email={account.email} />;
  // An old anonymous session (before R26) carries on only if the founders already approved it.
  if (account.anonymous && account.access !== "approved") return <SignInScreen oldSession />;
  if (account.profile === null) return <Onboarding googleName={account.googleName} />;
  if (account.access === "pending") return <PendingScreen email={account.email} profile={account.profile} />;
  if (me === undefined || me === null) return <Loading />;
  return <HomeBody me={me} />;
}
