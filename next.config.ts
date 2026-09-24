import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  // Pin the workspace root to this project (a stray lockfile higher up the tree confused inference).
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
