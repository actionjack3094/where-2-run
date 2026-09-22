import { isUuid } from "@/lib/arena/display";
import { loadDebateComments } from "@/lib/comments";
import { DebateView } from "./debate-view";

type DebatePageProps = {
  params: Promise<{ id: string }>;
};

export default async function DebatePage({ params }: DebatePageProps) {
  const { id } = await params;
  const comments = isUuid(id) ? await loadDebateComments(id) : [];
  return <DebateView key={id} debateId={id} comments={comments} />;
}
