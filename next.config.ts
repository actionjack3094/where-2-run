import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/feed", destination: "/ballot", permanent: false },
      { source: "/discover", destination: "/debates", permanent: false },
    ];
  },
};

export default nextConfig;
