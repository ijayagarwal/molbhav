"use client";

// A next/link that also sends an analytics beacon when tapped (the /p CTA, G6). The beacon goes out before the
// navigation and survives it.
import Link from "next/link";
import type { ComponentProps } from "react";
import type { EventName, EventProps } from "@/lib/analytics";
import { beacon } from "./beacon";

type Props<N extends EventName> = ComponentProps<typeof Link> & { event: N; eventProps?: EventProps<N> };

export function BeaconLink<N extends EventName>({ event, eventProps, onClick, ...rest }: Props<N>) {
  return (
    <Link
      {...rest}
      onClick={(e) => {
        beacon(event, eventProps);
        onClick?.(e);
      }}
    />
  );
}
