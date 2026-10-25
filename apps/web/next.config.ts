import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@quick-apply/shared"],
  // PDF.js loads its worker relative to its own package at runtime. Keeping the
  // package external prevents Next from relocating it into .next/vendor-chunks.
  serverExternalPackages: ["pdfjs-dist"]
};

export default nextConfig;
