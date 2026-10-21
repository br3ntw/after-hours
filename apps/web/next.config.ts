import type { NextConfig } from "next";

// The browser only ever talks to this origin. /api/v1/* is proxied to FastAPI, which keeps
// the refresh-token cookie first-party (SameSite=Strict) with no CORS in production.
const API_ORIGIN = process.env.AH_API_ORIGIN ?? "http://localhost:8000";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

// GitHub Pages build (`npm run build:pages`): a static export whose API and simulation run
// in the browser (src/lib/demo). No server, so no rewrites or response headers.
const BROWSER_DEMO = process.env.NEXT_PUBLIC_AH_BROWSER_DEMO === "1";

const nextConfig: NextConfig = {
  ...(BROWSER_DEMO && {
    output: "export",
    basePath: process.env.AH_BASE_PATH ?? "/after-hours",
    trailingSlash: true, // Pages serves /map/ as /map/index.html
  }),
  // Static export can't use Cache Components/PPR (next/dist/export). Data loads client-side
  // either way, so the demo loses nothing.
  cacheComponents: !BROWSER_DEMO,
  partialPrefetching: !BROWSER_DEMO,
  experimental: {
    // Ops pages render only after the client restores the session (the access token lives
    // in memory, recovered from the httpOnly refresh cookie), so navigations into them
    // can't be instant. Validate only segments that opt in with an explicit `instant`
    // (none do). Replaces a per-page `instant = false`, which a static export rejects.
    instantInsights: { validationLevel: "manual-warning" },
  },
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  ...(!BROWSER_DEMO && {
    async rewrites() {
      return [{ source: "/api/v1/:path*", destination: `${API_ORIGIN}/api/v1/:path*` }];
    },
    async headers() {
      return [{ source: "/:path*", headers: securityHeaders }];
    },
  }),
};

export default nextConfig;
