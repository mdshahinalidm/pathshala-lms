import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // ── PERMANENT FIX: admin video/image uploads >10MB failed (502) ──
  // The proxy layer (proxy.ts) makes Next.js clone every request body with
  // a 10MB default cap — larger bodies are silently TRUNCATED ("Request
  // body exceeded 10MB…"), which killed big lesson-video uploads
  // mid-stream (busboy "Unexpected end of form" → 502). Raised above the
  // upload API's 512MB ceiling so any admin upload streams through
  // completely.
  experimental: {
    proxyClientMaxBodySize: "600mb",
  },
  // ── PERMANENT FIX: reverse-proxy redirect loop ──
  // Some reverse proxies 301-redirect `/dashboard` → `/dashboard/`
  // (treating it as a directory). Next.js by default 308-redirects
  // `/dashboard/` → `/dashboard` (trailing-slash normalization), creating an
  // infinite 301↔308 ping-pong that the browser surfaces as
  // ERR_TOO_MANY_REDIRECTS ("This page isn't working").
  // Skipping Next's slash redirects makes BOTH /dashboard and /dashboard/
  // serve the same page → the proxy's single 301 resolves and the loop
  // can never form again on any route (dashboard, admin, API, …).
  skipTrailingSlashRedirect: true,
  // Extra origins allowed to fetch dev assets (/_next/*) when the site is
  // viewed through a tunneling/proxy domain during development.
  // Configure locally via DEV_ALLOWED_ORIGINS="origin1,origin2".
  allowedDevOrigins: process.env.DEV_ALLOWED_ORIGINS
    ? process.env.DEV_ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean)
    : [],
  typescript: {
    ignoreBuildErrors: true,
  },
  // Speed & security polish (zero visual/behavioural change):
  //   • poweredByHeader:false — stop advertising the framework version
  //     (security-by-obscurity hygiene + one fewer response header).
  //   • compress:true — explicit gzip for text responses (prod server).
  //   • next/image negotiates AVIF first (≈30% smaller than WebP, same
  //     pixels), with a 31-day optimized-image cache so repeat requests
  //     never re-compress.
  poweredByHeader: false,
  compress: true,
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 2678400,
  },
  // Uploads are content-addressed (random prefix + dated folder) → cache
  // hard for 1 year. Keeps course media loads near-instant on repeat views.
  // /images/* (brand/hero/og assets) also cached — they are
  // build-time static files; 1-day freshness + 7-day stale-while-revalidate
  // keeps first loads instant without any staleness risk.
  async headers() {
    return [
      {
        source: "/uploads/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      {
        source: "/images/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
  reactStrictMode: false,
  // Permanently hide the Next.js dev-tools logo badge (the floating "N"
  // indicator shown in the corner of every page during development).
  devIndicators: false,
};

export default nextConfig;

