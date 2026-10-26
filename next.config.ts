import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Every visitor gets one fully formed document, so the page also works without JavaScript (no hidden streamed content).
  htmlLimitedBots: /.*/,
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
