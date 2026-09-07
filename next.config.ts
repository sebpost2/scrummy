import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  cacheOnNavigation: true,
});

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          {
            key: "Content-Security-Policy",
            // ponytail: 'unsafe-inline' on script-src/style-src since Next.js
            // hydration relies on inline scripts and there's no nonce plumbing
            // here — upgrade to a nonce-based policy if a future feature ever
            // renders untrusted content as markup.
            //
            // No changes needed for the service worker or /api/sync: worker-src
            // and manifest-src both fall back to default-src 'self', and the
            // sync route is same-origin under connect-src 'self'.
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
          },
        ],
      },
    ];
  },
};

export default withSerwist(nextConfig);
