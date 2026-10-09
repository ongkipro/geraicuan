// GeraiCuan public landing site (T-184, PR-63, D-11; loket redesign T-296). Static output only.
import { defineConfig, fontProviders } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://geraicuan.com",
  output: "static",
  trailingSlash: "ignore",
  devToolbar: { enabled: false },
  // Inline (empty) PostCSS config stops Vite from picking up the Next.js app's
  // postcss.config.mjs at the repository root; Tailwind runs as a Vite plugin.
  vite: { plugins: [tailwindcss()], css: { postcss: {} } },
  // Inter, self-hosted: downloaded at build time into dist/_astro/fonts.
  fonts: [
    {
      provider: fontProviders.fontsource(),
      name: "Inter",
      cssVariable: "--font-inter",
      weights: [400, 500, 600, 700, 800],
      styles: ["normal"],
      subsets: ["latin"],
    },
  ],
});
