import { MENGANTAR_COURIERS, mengantarCourierOfService, type MengantarCourier } from "@/lib/mengantar-couriers";

/**
 * T-243: Profil gerai & brand, the gerai logo and Mitra kurir. Pure rules shared by the
 * Server Actions, the repository and the tests; the database re-checks each one.
 */

// ---------------------------------------------------------------- gerai logo

export const LOGO_MAX_BYTES = 200 * 1024;
export const LOGO_MAX_DIMENSION = 1000;
export const LOGO_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type LogoMime = (typeof LOGO_MIME_TYPES)[number];

export type SniffedLogo = { mime: LogoMime; width: number; height: number };

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const ascii = (b: Uint8Array, i: number, length: number) => String.fromCharCode(...b.subarray(i, i + length));

function sniffPng(b: Uint8Array): SniffedLogo | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 24 || signature.some((byte, i) => b[i] !== byte) || ascii(b, 12, 4) !== "IHDR") return null;
  return { mime: "image/png", width: u32be(b, 16), height: u32be(b, 20) };
}

/** Walks the JPEG segments to the first start-of-frame, which carries the size. */
function sniffJpeg(b: Uint8Array): SniffedLogo | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    if (marker === 0xff) { i += 1; continue; }
    if (marker === 0xd9 || marker === 0xda) return null;
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) return { mime: "image/jpeg", width: u16be(b, i + 7), height: u16be(b, i + 5) };
    i += 2 + u16be(b, i + 2);
  }
  return null;
}

function sniffWebp(b: Uint8Array): SniffedLogo | null {
  if (b.length < 30 || ascii(b, 0, 4) !== "RIFF" || ascii(b, 8, 4) !== "WEBP") return null;
  const chunk = ascii(b, 12, 4);
  if (chunk === "VP8 " && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) {
    return { mime: "image/webp", width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff };
  }
  if (chunk === "VP8L" && b[20] === 0x2f) {
    return {
      mime: "image/webp",
      width: 1 + (((b[22] & 0x3f) << 8) | b[21]),
      height: 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6)),
    };
  }
  if (chunk === "VP8X") return { mime: "image/webp", width: 1 + u24le(b, 24), height: 1 + u24le(b, 27) };
  return null;
}

/** The image type from its magic bytes, never from the file name or the browser's claim. */
export function sniffLogo(bytes: Uint8Array): SniffedLogo | null {
  return sniffPng(bytes) ?? sniffJpeg(bytes) ?? sniffWebp(bytes);
}

export type LogoRejection = "EMPTY" | "TOO_LARGE" | "SVG" | "UNSUPPORTED" | "TYPE_MISMATCH" | "DIMENSIONS";

export const LOGO_REJECTION_COPY: Record<LogoRejection, string> = {
  EMPTY: "Pilih berkas logo terlebih dahulu.",
  TOO_LARGE: "Ukuran logo maksimal 200 KB. Perkecil gambarnya lalu unggah lagi.",
  SVG: "Logo SVG tidak diterima. Unggah PNG, JPEG, atau WebP.",
  UNSUPPORTED: "Berkas ini bukan gambar PNG, JPEG, atau WebP.",
  TYPE_MISMATCH: "Isi berkas tidak sesuai jenisnya. Simpan ulang sebagai PNG, JPEG, atau WebP.",
  DIMENSIONS: "Ukuran logo maksimal 1000 × 1000 piksel.",
};

/**
 * Upload rule (T-243): PNG, JPEG or WebP by magic bytes, at most 200 KB and 1000 × 1000
 * px. SVG is refused outright (it can carry script); so is a file whose declared type
 * names a different image than its bytes.
 */
export function validateLogoUpload(input: { bytes: Uint8Array; declaredType: string; name: string }):
  | { ok: true; logo: SniffedLogo }
  | { ok: false; reason: LogoRejection } {
  const { bytes } = input;
  if (bytes.length === 0) return { ok: false, reason: "EMPTY" };
  if (bytes.length > LOGO_MAX_BYTES) return { ok: false, reason: "TOO_LARGE" };
  const declared = input.declaredType.trim().toLowerCase();
  const head = new TextDecoder().decode(bytes.subarray(0, 256)).replace(/^﻿/, "").trimStart().toLowerCase();
  if (declared === "image/svg+xml" || /\.svgz?$/i.test(input.name) || head.startsWith("<svg") || head.startsWith("<?xml")) {
    return { ok: false, reason: "SVG" };
  }
  const logo = sniffLogo(bytes);
  if (!logo) return { ok: false, reason: "UNSUPPORTED" };
  if (declared !== "" && declared !== logo.mime && !(declared === "image/jpg" && logo.mime === "image/jpeg")) {
    return { ok: false, reason: "TYPE_MISMATCH" };
  }
  if (logo.width < 1 || logo.height < 1 || logo.width > LOGO_MAX_DIMENSION || logo.height > LOGO_MAX_DIMENSION) {
    return { ok: false, reason: "DIMENSIONS" };
  }
  return { ok: true, logo };
}

/** The authenticated logo route; `v` changes with the image so a new logo is never stale. */
export function geraiLogoSrc(sha256: string | null) {
  return sha256 ? `/app/brand/logo?v=${sha256.slice(0, 16)}` : null;
}

export const LOGO_SHA256_PATTERN = /^[0-9a-f]{64}$/;

/**
 * T-247 (review L3): one saved logo version, as an issued invoice recorded it. The route
 * serves it from `tenant_logo_versions` for the session's tenant only; the sha names the
 * bytes, never the tenant.
 */
export function geraiLogoVersionSrc(sha256: string | null) {
  return sha256 && LOGO_SHA256_PATTERN.test(sha256) ? `/app/brand/logo?sha=${sha256}` : null;
}

// ------------------------------------------------------------ Profil gerai

/** Kategori usaha: the reference list (pengaturan.html, 2026-09-26) plus Lainnya. */
export const BUSINESS_CATEGORIES = {
  FASHION: "Fashion, tekstil & pakaian",
  BEAUTY: "Kosmetik & perawatan diri",
  FOOD: "Makanan & minuman kering",
  ELECTRONICS: "Elektronik & gadget",
  HEALTH: "Herbal & kesehatan",
  OTHER: "Lainnya",
} as const;
export type BusinessCategory = keyof typeof BUSINESS_CATEGORIES;

export const LABEL_NOTE_MAX = 60;
const CONTROL = /[\u0000-\u001f\u007f]/u;

export type GeraiProfileInput = {
  businessCategory: BusinessCategory | null;
  csEmail: string | null;
  labelNote: string | null;
  website: string | null;
};

export type GeraiProfileField = keyof GeraiProfileInput;

/**
 * Every field optional; an empty field clears it. Returns the normalised values, or the
 * Indonesian message for each field that is refused (nothing is guessed).
 */
export function parseGeraiProfile(raw: Record<GeraiProfileField, string>):
  | { ok: true; value: GeraiProfileInput }
  | { ok: false; errors: Partial<Record<GeraiProfileField, string>> } {
  const errors: Partial<Record<GeraiProfileField, string>> = {};

  const category = raw.businessCategory.trim();
  if (category !== "" && !(category in BUSINESS_CATEGORIES)) errors.businessCategory = "Pilih kategori dari daftar.";

  const note = raw.labelNote.replace(/\s+/gu, " ").trim();
  if (CONTROL.test(raw.labelNote.replace(/[\t\n\r]/g, " "))) errors.labelNote = "Catatan resi tidak boleh berisi karakter kontrol.";
  else if (note.length > LABEL_NOTE_MAX) errors.labelNote = `Catatan resi maksimal ${LABEL_NOTE_MAX} karakter.`;

  const email = raw.csEmail.trim().toLowerCase();
  if (email !== "" && (email.length > 254 || !/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[a-z]{2,}$/u.test(email))) {
    errors.csEmail = "Isi email yang benar, misalnya cs@gerai.id.";
  }

  let website: string | null = null;
  const site = raw.website.trim();
  if (site !== "") {
    const candidate = /^[a-z][a-z0-9+.-]*:/i.test(site) ? site : `https://${site}`;
    let url: URL | null = null;
    try {
      url = new URL(candidate);
    } catch {
      url = null;
    }
    if (!url || url.protocol !== "https:" || !url.hostname.includes(".") || url.username || url.password || candidate.length > 200) {
      errors.website = "Isi alamat situs https yang benar, misalnya https://gerai.id.";
    } else {
      website = url.href;
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      businessCategory: category === "" ? null : (category as BusinessCategory),
      csEmail: email === "" ? null : email,
      labelNote: note === "" ? null : note,
      website,
    },
  };
}

// -------------------------------------------------------------- Mitra kurir

/**
 * The couriers a gerai may switch on or off: every catalogue courier except Ninja, which
 * Mengantar discontinued (D-29) and is never offered. Compared as a string so this holds
 * whether or not the catalogue still lists it.
 */
export const SELECTABLE_COURIERS: readonly MengantarCourier[] = MENGANTAR_COURIERS.filter(
  (courier) => (courier as string) !== "Ninja",
);

/**
 * Monochrome print-ready courier marks (`public/couriers/print/<key>.svg`, black paths
 * only) for the thermal label. A courier without one prints its name as bold text.
 */
export function courierPrintLogoSrc(courier: string) {
  const known = MENGANTAR_COURIERS.find((candidate) => candidate.toLowerCase() === courier.trim().toLowerCase())
    ?? mengantarCourierOfService(courier);
  return known && SELECTABLE_COURIERS.includes(known) ? `/couriers/print/${known.toLowerCase()}.svg` : null;
}

/** The switched-off couriers from the Mitra kurir form (`kurir.<code>` = "1" | "0"); null when incomplete or forged. */
export function parseDisabledCouriers(formData: FormData): MengantarCourier[] | null {
  const disabled: MengantarCourier[] = [];
  for (const courier of SELECTABLE_COURIERS) {
    const value = formData.get(`kurir.${courier}`);
    if (value !== "1" && value !== "0") return null;
    if (value === "0") disabled.push(courier);
  }
  return disabled;
}

/**
 * Cek tarif and Buat kiriman offer only the gerai's switched-on couriers. A service no
 * catalogue courier claims stays visible (a new Mengantar courier must not vanish).
 */
export function filterTenantCourierServices<T extends { providerService: string }>(
  services: readonly T[],
  disabledCouriers: readonly string[],
): T[] {
  if (disabledCouriers.length === 0) return [...services];
  return services.filter((service) => {
    const courier = mengantarCourierOfService(service.providerService);
    return courier === null || !disabledCouriers.includes(courier);
  });
}

// ------------------------------------------------------------ Titik pickup

export type PickupNotes = {
  picName: string | null;
  picPhone: string | null;
  schedule: string | null;
  accessNote: string | null;
};

export const PICKUP_NOTE_LIMITS: Record<keyof PickupNotes, number> = {
  picName: 80,
  picPhone: 20,
  schedule: 120,
  accessNote: 240,
};
