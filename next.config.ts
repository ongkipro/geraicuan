import type { NextConfig } from "next";

const allowedDevOrigins = process.env.NEXT_ALLOWED_DEV_ORIGINS?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

/**
 * T-286 (M1): response headers on every path of both CMS hosts. The CSP sets only directives that
 * need no nonce — framing, plugins, `<base>` and form targets — so Next.js's inline scripts keep
 * working; a `script-src` policy needs nonces from `src/proxy.ts` and is not part of this one.
 * The app uses no camera, microphone, location or payment API (handover scanning is a keyboard
 * wedge), so all are denied. HSTS only in production, where both hosts are HTTPS (DEP-1); a
 * development server on http must not pin the browser to HTTPS for its host.
 */
function securityHeaders() {
  return [
    {
      headers: [
        ...(process.env.NODE_ENV === "production"
          ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
          : []),
        {
          key: "Content-Security-Policy",
          value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
        },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Frame-Options", value: "DENY" },
        {
          key: "Permissions-Policy",
          value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
        },
      ],
      source: "/:path*",
    },
  ];
}

const nextConfig: NextConfig = {
  async headers() {
    return securityHeaders();
  },
  logging: { serverFunctions: false },
  poweredByHeader: false,
  // T-194: the production image (Dockerfile) runs `.next/standalone/server.js`
  // with only the traced files. `next start` keeps working for local use.
  output: "standalone",
  // T-188: the single Kontak directory became the Pengirim and Penerima menus.
  // Old links and bookmarks land on the matching role list; the query string
  // (e.g. `status`) is passed through. Order matters: first match wins.
  async redirects() {
    return [
      {
        destination: "/app/kontak/penerima",
        has: [{ key: "peran", type: "query", value: "penerima" }],
        permanent: true,
        source: "/app/kontak",
      },
      { destination: "/app/kontak/pengirim", permanent: true, source: "/app/kontak" },
      // T-204: Impor CSV, Keuangan and Analitik left the product; old bookmarks land on
      // the page that now does their job instead of a bare 404. Temporary, so a browser
      // does not cache the decision if a page ever returns.
      { destination: "/app/pengiriman/baru", permanent: false, source: "/app/impor/:path*" },
      { destination: "/app/laporan/pengiriman", permanent: false, source: "/app/keuangan/:path*" },
      { destination: "/app/laporan/pengiriman", permanent: false, source: "/app/analitik/:path*" },
    ];
  },
  ...(allowedDevOrigins ? { allowedDevOrigins } : {}),
};

export default nextConfig;
