import { supabase } from "@/lib/db/supabase";
import { parseVector } from "@/lib/ideology/vector";

export type GraderToastState = "analyzing" | "done" | "timeout";

export function vectorKey(value: unknown) {
  return JSON.stringify(parseVector(value));
}

export async function waitForIdeologyGrader(options: {
  authorId: string;
  argumentId: string;
  previousVector: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<Exclude<GraderToastState, "analyzing">> {
  const timeoutMs = options.timeoutMs ?? 12000;
  const started = Date.now();
  const previous = vectorKey(options.previousVector);

  while (Date.now() - started < timeoutMs) {
    if (options.signal?.aborted) return "timeout";

    const [{ data: profile }, { data: argument }] = await Promise.all([
      supabase
        .from("users")
        .select("ideology_vector")
        .eq("id", options.authorId)
        .maybeSingle(),
      supabase.from("arguments").select("*").eq("id", options.argumentId).maybeSingle(),
    ]);

    const gradedAt =
      argument && "graded_at" in argument
        ? (argument as { graded_at?: string | null }).graded_at
        : null;
    if (gradedAt) return "done";
    if (profile && vectorKey(profile.ideology_vector) !== previous) return "done";

    await new Promise((resolve) => window.setTimeout(resolve, 450));
  }

  return "timeout";
}
