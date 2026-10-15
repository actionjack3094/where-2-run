import { Play } from "lucide-react";
import { cn } from "@/lib/utils";

export function SoapboxPreviewCard({
  post,
}: {
  post: {
    key: string;
    name: string;
    handle: string;
    text: string;
    video: "wide" | "tall" | null;
  };
}) {
  return (
    <article className="border-b border-stone-200 px-4 py-5">
      <div className="flex gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stone-200 text-xs font-semibold text-stone-600"
          aria-hidden
        >
          {post.name.slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-5">
            <span className="font-semibold text-stone-900">{post.name}</span>{" "}
            <span className="text-stone-500">@{post.handle}</span>
          </p>
          <p className="mt-2 text-[15px] leading-6 text-stone-800">{post.text}</p>
          {post.video ? (
            <div
              className={cn(
                "relative mt-3 flex items-center justify-center overflow-hidden rounded-2xl bg-stone-900",
                post.video === "tall" ? "aspect-[9/14]" : "aspect-video",
              )}
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-stone-900">
                <Play className="ml-0.5 h-6 w-6 fill-current" aria-hidden />
                <span className="sr-only">Video placeholder</span>
              </span>
              <p className="absolute bottom-3 left-3 text-xs font-medium uppercase tracking-widest text-white/80">
                Video
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
