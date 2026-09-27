import { ImageResponse } from "@vercel/og";
import { OG_SIZE, OgCardImage } from "@/lib/og/card";
import { loadCandidateCard } from "@/lib/og/load";

export const alt = "WHERE 2 RUN candidate";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const card = await loadCandidateCard(id);
  return new ImageResponse(<OgCardImage card={card} />, size);
}
