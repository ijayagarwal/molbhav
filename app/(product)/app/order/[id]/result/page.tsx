import { ResultScreen } from "@/features/app/ResultScreen";

// /app/order/[id]/result: the winner, the saving and the comparison (DESIGN §12.7).
export default async function ResultPage({ params }: PageProps<"/app/order/[id]/result">) {
  const { id } = await params;
  return <ResultScreen orderId={id} />;
}
