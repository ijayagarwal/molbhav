import type { ReactNode } from "react";
import { MotionRoot } from "@/components/mb/MotionRoot";

// The order screens are the only /app pages with motion (board rows, stamps, price drops, the tally). Every
// m.* element needs LazyMotion's features or it stays at its initial style, invisible (F7). Mounting it here,
// not in the product layout, keeps the motion code out of Home's and onboarding's first load (DESIGN §20).
export default function OrderLayout({ children }: { children: ReactNode }) {
  return <MotionRoot>{children}</MotionRoot>;
}
