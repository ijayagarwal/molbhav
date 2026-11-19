import Image from "next/image";

/**
 * Google's "G" mark, as Google's sign-in branding asks for: a third-party image asset, not our palette
 * (DESIGN.md §8, third-party marks). Decorative: the button's text says "Google".
 */
export function GoogleMark({ className = "size-5 shrink-0" }: { className?: string }) {
  return <Image src="/brand/google-g.svg" alt="" width={20} height={20} unoptimized className={className} />;
}
