import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Every visitor gets one fully formed document, so the page also works without JavaScript (no hidden streamed content).
  htmlLimitedBots: /.*/,
  // Photo uploads (15 MB cap in src/modules/media) plus multipart overhead. The proxy buffers bodies too, so it needs the same room.
  // shortcut: the file passes through the server request; Vercel caps bodies at 4.5 MB, switch to signed direct uploads to Storage before deploying there.
  experimental: {
    serverActions: { bodySizeLimit: "16mb" },
    proxyClientMaxBodySize: "16mb",
  },
  turbopack: {
    rules: {
      "*.css": {
        // `as: "*.css"` would turn CSS modules into plain CSS (every `styles.x` undefined); they need no Tailwind anyway.
        condition: { not: { path: /\.module\.css$/ } },
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
