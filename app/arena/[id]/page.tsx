import { isUuid } from "@/lib/arena/display";
import { loadDebateComments } from "@/lib/comments";
import { DebateView } from "./debate-view";

export default async function DebatePage(props: PageProps<"/arena/[id]">) {
  const { id } = await props.params;
  const comments = isUuid(id) ? await loadDebateComments(id) : [];
  return <DebateView key={id} debateId={id} comments={comments} />;
}
