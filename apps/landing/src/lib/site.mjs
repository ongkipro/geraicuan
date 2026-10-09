// Site-wide values for the GeraiCuan landing pages (T-296).

// The one build-time configuration value: where the tenant CMS lives. A bare
// http(s) origin only, so a mistyped value fails the build instead of shipping a
// CTA that points somewhere else.
const configuredOrigin = import.meta.env.PUBLIC_APP_ORIGIN || "https://app.geraicuan.com";
const parsedOrigin = new URL(configuredOrigin);
if (
  !["http:", "https:"].includes(parsedOrigin.protocol) ||
  parsedOrigin.username || parsedOrigin.password ||
  parsedOrigin.pathname !== "/" || parsedOrigin.search || parsedOrigin.hash
) {
  throw new Error(`PUBLIC_APP_ORIGIN must be a bare http(s) origin, got ${JSON.stringify(configuredOrigin)}`);
}
const appOrigin = parsedOrigin.origin;

export const SITE_ORIGIN = "https://geraicuan.com";
export const BRAND = "GeraiCuan";
export const SIGN_UP_URL = `${appOrigin}/daftar`;
export const SIGN_IN_URL = `${appOrigin}/login`;

// Owner's onboarding line. The owner's rule allows one WhatsApp CTA per page,
// never in the header, menu or hero; the footer lists the number as plain text.
export const WHATSAPP_DISPLAY = "+62 831-9314-4001";
export const WHATSAPP_URL = "https://wa.me/6283193144001?text=Halo%20Admin%20GeraiCuan%2C%20saya%20ingin%20daftar%20loket%20toko";

export const NAV = [
  { href: "/", label: "Beranda" },
  { href: "/fitur/", label: "Fitur" },
  { href: "/simulasi/", label: "Simulasi cuan" },
  { href: "/cara-kerja/", label: "Alur kasir" },
  { href: "/kontak/", label: "Kontak" },
];

// D-26 / D-29 (src/lib/mengantar-couriers.ts): couriers a gerai can order through
// Mengantar. SPX and Paxel are quoted in Cek tarif but cannot be ordered yet;
// Ninja was discontinued by Mengantar on 2026-09-01.
export const ORDERABLE_COURIERS = [
  { name: "J&T Express", logo: "/logos/kurir/jnt.svg" },
  { name: "JNE", logo: "/logos/kurir/jne.svg" },
  { name: "SiCepat", logo: "/logos/kurir/sicepat.svg" },
  { name: "Lion Parcel", logo: "/logos/kurir/lionparcel.svg" },
  { name: "ID Express", logo: "/logos/kurir/idx.svg" },
  { name: "AnterAja", logo: "/logos/kurir/anteraja.png" },
  { name: "POS Indonesia", logo: "/logos/kurir/pos.png" },
  { name: "SAP Express", logo: "/logos/kurir/sap.png" },
];
export const QUOTE_ONLY_COURIERS = [{ name: "Paxel", logo: "/logos/kurir/paxel.png" }];
