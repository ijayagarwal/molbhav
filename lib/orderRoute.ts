// Which screen an order belongs on, by its status (ARCHITECTURE §3 routes, DESIGN §12).
import type { DictKey } from "./i18n/getDict";

export type OrderStatus = "draft" | "confirmed" | "sweeping" | "haggling" | "matching" | "ready" | "placing" | "placed" | "cancelled" | "failed";
export type OrderScreen = "confirm" | "dealers" | "sweep" | "result" | "placed" | null;

export function screenFor(status: OrderStatus): OrderScreen {
  switch (status) {
    case "draft":
      return "confirm";
    case "confirmed":
      return "dealers";
    case "sweeping":
    case "haggling":
    case "matching":
      return "sweep";
    case "ready":
      return "result";
    case "placing":
    case "placed":
      return "placed";
    default:
      return null;
  }
}

export function orderPath(orderId: string, status: OrderStatus): string {
  const screen = screenFor(status);
  return screen ? `/app/order/${orderId}/${screen}` : "/app";
}

export const ORDER_STATUS_KEY: Record<OrderStatus, DictKey> = {
  draft: "order.draft",
  confirmed: "order.confirmed",
  sweeping: "order.running",
  haggling: "order.running",
  matching: "order.running",
  ready: "order.ready",
  placing: "order.placing",
  placed: "order.placed",
  cancelled: "order.cancelled",
  failed: "order.failed",
};

export const RUNNING: ReadonlySet<OrderStatus> = new Set(["sweeping", "haggling", "matching"]);
