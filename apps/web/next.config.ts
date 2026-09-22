import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@touchline/validation"],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
