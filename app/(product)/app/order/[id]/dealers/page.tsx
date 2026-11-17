import { DealersScreen } from "@/features/app/DealersScreen";

// /app/order/[id]/dealers: choose who to call (DESIGN §12.4).
export default async function DealersPage({ params }: PageProps<"/app/order/[id]/dealers">) {
  const { id } = await params;
  return <DealersScreen orderId={id} />;
}
