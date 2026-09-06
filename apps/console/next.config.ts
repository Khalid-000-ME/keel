import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace packages ship raw TypeScript (their `main` points at src/), so
  // Next has to compile them rather than treating them as prebuilt deps.
  transpilePackages: ["@keel/strategy-sdk", "@keel/seam"],
};

export default nextConfig;
