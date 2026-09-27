import { ImageResponse } from "@vercel/og";
import { OG_SIZE, OgCardImage } from "@/lib/og/card";
import { loadRankingsCard } from "@/lib/og/load";

export const alt = "WHERE 2 RUN ELO rankings";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image() {
  const card = await loadRankingsCard();
  return new ImageResponse(<OgCardImage card={card} />, size);
}
