import { OrderRedirect } from "@/features/app/OrderRedirect";

// /app/order/[id]: sends the order to the screen its status belongs on.
export default async function OrderPage({ params }: PageProps<"/app/order/[id]">) {
  const { id } = await params;
  return <OrderRedirect orderId={id} />;
}
