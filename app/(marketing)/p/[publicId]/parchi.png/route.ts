import { sharedParchiImage } from "@/features/share/sharedParchiImage";

// The shared parchi's image at a fixed URL (the og:image route's URL is hashed in production). The share
// sheet fetches it so navigator.share can attach the picture; it shows only what /p/<id> shows.
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const image = await sharedParchiImage(publicId);
  image.headers.set("Cache-Control", "private, no-store");
  image.headers.set("X-Robots-Tag", "noindex");
  return image;
}
