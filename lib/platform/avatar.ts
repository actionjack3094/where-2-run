const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "webp"]);

/** Public avatars bucket URL for this project, optionally locked to one user folder. */
export function publicAvatarUrl(value: string | null | undefined, userId?: string) {
  const raw = value?.trim();
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!raw || !base) return null;

  let url: URL;
  let expected: URL;
  try {
    url = new URL(raw);
    expected = new URL(base);
  } catch {
    return null;
  }
  if (url.search || url.hash || url.username || url.password) return null;
  if (url.protocol !== expected.protocol || url.hostname !== expected.hostname || url.port !== expected.port) {
    return null;
  }

  const marker = "/storage/v1/object/public/avatars/";
  let path: string;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  if (!path.startsWith(marker) || path.includes("..")) return null;
  const rest = path.slice(marker.length);
  const parts = rest.split("/");
  if (parts.length !== 2) return null;
  const [owner, file] = parts;
  if (!owner || !file || (userId && owner !== userId)) return null;
  const ext = file.slice(file.lastIndexOf(".") + 1).toLowerCase();
  if (!file.includes("-avatar.") || !IMAGE_EXT.has(ext)) return null;
  return `${expected.origin}${marker}${owner}/${file}`;
}
