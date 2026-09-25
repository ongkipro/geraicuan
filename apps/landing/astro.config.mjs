// GeraiCUAN public landing page (T-184, PR-63, D-11). Static output only.
import { defineConfig, fontProviders } from "astro/config";

export default defineConfig({
  site: "https://geraicuan.com",
  output: "static",
  trailingSlash: "ignore",
  devToolbar: { enabled: false },
  // Inter, as the CMS loads it (src/app/layout.tsx: next/font Inter, latin, --font-inter).
  // Files are downloaded at build time and self-hosted under dist/_astro/fonts.
  fonts: [
    {
      provider: fontProviders.fontsource(),
      name: "Inter",
      cssVariable: "--font-inter",
      weights: [400, 500, 600, 700],
      styles: ["normal"],
      subsets: ["latin"],
    },
  ],
});
