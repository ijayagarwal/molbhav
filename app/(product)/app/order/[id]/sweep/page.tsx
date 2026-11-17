import { SweepScreen } from "@/features/app/SweepScreen";

// /app/order/[id]/sweep: the live sweep board (DESIGN §12.5).
export default async function SweepPage({ params }: PageProps<"/app/order/[id]/sweep">) {
  const { id } = await params;
  return <SweepScreen orderId={id} />;
}
