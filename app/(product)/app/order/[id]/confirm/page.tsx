import { ConfirmScreen } from "@/features/app/ConfirmScreen";

// /app/order/[id]/confirm: "ये सही है?" (DESIGN §12.3).
export default async function ConfirmPage({ params }: PageProps<"/app/order/[id]/confirm">) {
  const { id } = await params;
  return <ConfirmScreen orderId={id} />;
}
