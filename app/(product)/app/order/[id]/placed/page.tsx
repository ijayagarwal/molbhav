import { PlacedScreen } from "@/features/app/PlacedScreen";

// /app/order/[id]/placed: the undo window, the confirm call, and "ऑर्डर पक्का" (DESIGN §12.8).
export default async function PlacedPage({ params }: PageProps<"/app/order/[id]/placed">) {
  const { id } = await params;
  return <PlacedScreen orderId={id} />;
}
