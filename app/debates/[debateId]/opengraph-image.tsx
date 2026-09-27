import { ImageResponse } from "@vercel/og";
import { OG_SIZE, OgCardImage } from "@/lib/og/card";
import { loadDebateCard } from "@/lib/og/load";

export const alt = "WHERE 2 RUN debate matchup";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ debateId: string }>;
}) {
  const { debateId } = await params;
  const card = await loadDebateCard(debateId);
  return new ImageResponse(<OgCardImage card={card} />, size);
}
