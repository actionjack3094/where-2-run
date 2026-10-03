import { afterEach, describe, expect, it } from "vitest";
import { publicAvatarUrl } from "@/lib/platform/avatar";

const base = "https://example.supabase.co";
const own = `${base}/storage/v1/object/public/avatars/user-1/1710000000000-avatar.jpg`;

describe("public avatar urls", () => {
  const previous = process.env.NEXT_PUBLIC_SUPABASE_URL;

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = previous;
  });

  it("keeps a public avatars url in the signed-in user's folder", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = base;
    expect(publicAvatarUrl(own, "user-1")).toBe(own);
    expect(publicAvatarUrl(`${base}/storage/v1/object/public/avatars/user-1/1-avatar.webp`, "user-1")).toContain(
      "-avatar.webp",
    );
  });

  it("rejects another host, another folder, and a non-image name", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = base;
    expect(publicAvatarUrl("https://evil.test/storage/v1/object/public/avatars/user-1/1-avatar.jpg", "user-1")).toBeNull();
    expect(publicAvatarUrl(own, "user-2")).toBeNull();
    expect(publicAvatarUrl(`${base}/storage/v1/object/public/avatars/user-1/1-avatar.gif`, "user-1")).toBeNull();
    expect(publicAvatarUrl(null)).toBeNull();
  });
});
