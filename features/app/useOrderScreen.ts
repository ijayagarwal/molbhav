"use client";

// Loads one of the caller's orders for a screen and keeps the URL honest: if the order's status belongs on
// another screen (it moved on, or a stale link), it replaces the route. Returns undefined while loading and
// null when the order doesn't exist or isn't the caller's (both look the same, by design).
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";
import { orderPath, screenFor, type OrderScreen } from "@/lib/orderRoute";

export function useOrderScreen(orderId: string, screen: OrderScreen) {
  const router = useRouter();
  // getOrNull reads a malformed or foreign id as null ("not found").
  const order = useQuery(api.orders.getOrNull, { orderId });
  const target = order ? screenFor(order.status) : null;
  useEffect(() => {
    if (order && target !== screen) router.replace(orderPath(order._id, order.status));
  }, [order, target, screen, router]);
  return order === undefined ? undefined : order && target === screen ? order : order === null ? null : undefined;
}
