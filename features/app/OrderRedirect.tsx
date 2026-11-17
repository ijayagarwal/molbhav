"use client";

import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";
import { useT } from "@/lib/i18n/useT";
import { orderPath } from "@/lib/orderRoute";
import { AppFrame } from "./AppFrame";
import { OrderLoading, OrderMissing } from "./OrderStates";
import { useRequireSession } from "./useSession";

export function OrderRedirect({ orderId }: { orderId: string }) {
  const { t } = useT();
  const router = useRouter();
  const signedIn = useRequireSession();
  const order = useQuery(api.orders.getOrNull, signedIn ? { orderId } : "skip");
  useEffect(() => {
    if (order) router.replace(orderPath(order._id, order.status));
  }, [order, router]);
  return <AppFrame back={{ href: "/app", label: t("rail.home") }}>{order === null ? <OrderMissing /> : <OrderLoading />}</AppFrame>;
}
