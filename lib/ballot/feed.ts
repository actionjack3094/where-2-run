export type RankedFeedItem = {
  kind: "debate" | "soapbox";
  id: string;
  likes: number;
  createdAt: string;
};

/** Likes change sort order only. Civic Standing is copied through unchanged. */
export function applyFeedLike(input: { likes: number; civicStanding: number }) {
  return {
    likes: input.likes + 1,
    civicStanding: input.civicStanding,
  };
}

export function rankFeedItems(items: RankedFeedItem[]) {
  return [...items].sort(
    (a, b) => b.likes - a.likes || Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
}
