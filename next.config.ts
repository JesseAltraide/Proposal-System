import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `pdf-parse` bundles `pdfjs-dist`, which references the browser-only
  // `DOMMatrix` API at module scope. Left to Next.js's own server bundler
  // (Turbopack/webpack), that gets pulled into the server chunk and crashes
  // at module evaluation on Vercel's Node runtime ("DOMMatrix is not
  // defined") - confirmed NOT a plain-Node problem (works fine via a normal
  // `require()`/dynamic `import()` outside Next's bundler), so the fix is to
  // stop Next from bundling it at all and let Node resolve it natively.
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
