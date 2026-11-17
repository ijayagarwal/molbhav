import { OG_SIZE } from "@/features/share/ogImage";
import { sharedParchiImage } from "@/features/share/sharedParchiImage";

// The shared parchi's preview image for WhatsApp (G4). Next.js serves it at a hashed URL in production, so
// the share sheet fetches the same image from the fixed /p/<id>/parchi.png instead.
export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Molbhav parchi";

export default async function Image({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  return sharedParchiImage(publicId);
}
