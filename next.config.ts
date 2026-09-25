import type { NextConfig } from "next";

const allowedDevOrigins = process.env.NEXT_ALLOWED_DEV_ORIGINS?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  logging: { serverFunctions: false },
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
    ];
  },
  ...(allowedDevOrigins ? { allowedDevOrigins } : {}),
};

export default nextConfig;
