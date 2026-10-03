import type { NextConfig } from "next";

function avatarRemotePatterns(): NonNullable<NextConfig["images"]>["remotePatterns"] {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!raw) return [];
  try {
    const url = new URL(raw);
    const protocol = url.protocol === "http:" ? "http" : "https";
    return [
      {
        protocol,
        hostname: url.hostname,
        ...(url.port ? { port: url.port } : {}),
        pathname: "/storage/v1/object/public/avatars/**",
      },
    ];
  } catch {
    return [];
  }
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns: avatarRemotePatterns(),
  },
  async redirects() {
    return [
      { source: "/feed", destination: "/ballot", permanent: false },
      { source: "/discover", destination: "/debates", permanent: false },
      { source: "/primaries", destination: "/elections", permanent: false },
      { source: "/primaries/:slug", destination: "/elections/:slug", permanent: false },
    ];
  },
};

export default nextConfig;
