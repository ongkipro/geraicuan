const idrFormatter = new Intl.NumberFormat("id-ID", {
  currency: "IDR",
  maximumFractionDigits: 0,
  style: "currency",
});

const weightFormatter = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 3,
});

const wibDateTimeFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

export function formatIdr(value: number) {
  return idrFormatter.format(value);
}

export function formatWibDateTime(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${wibDateTimeFormatter.format(date)} WIB`;
}

export function formatWeight(weightGrams: number) {
  return `${weightFormatter.format(weightGrams / 1_000)} kg`;
}

export function formatDimensions(
  lengthCm: number | null,
  widthCm: number | null,
  heightCm: number | null,
) {
  if (lengthCm === null || widthCm === null || heightCm === null) return null;
  return `${lengthCm} × ${widthCm} × ${heightCm} cm`;
}

export type RecipientDensity = {
  tier: "compact" | "long" | "dense" | "ultra";
  omitAreaLine: boolean;
  overCapacity: boolean;
};

export function recipientDensity(input: {
  nameLength: number;
  addressLength: number;
  areaLabelLength: number;
}): RecipientDensity {
  const combined = input.nameLength + input.addressLength + input.areaLabelLength;
  const overCapacity = input.addressLength > 484;

  if (combined <= 200) {
    return { omitAreaLine: false, overCapacity, tier: "compact" };
  }
  if (combined <= 300) {
    return { omitAreaLine: false, overCapacity, tier: "long" };
  }
  if (combined <= 380) {
    return { omitAreaLine: false, overCapacity, tier: "dense" };
  }
  return {
    omitAreaLine: combined > 480,
    overCapacity,
    tier: "ultra",
  };
}

const wibDateFormatter = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" });
const wibTimeFormatter = new Intl.DateTimeFormat("id-ID", { timeStyle: "short", timeZone: "Asia/Jakarta" });

/** Date and time as two short lines for compact tables: "14 Sep 2026" and "15.24 WIB". */
export function formatWibDateTimeParts(date: Date) {
  return { date: wibDateFormatter.format(date), time: `${wibTimeFormatter.format(date)} WIB` };
}

/**
 * District and city from a Mengantar area label ("subdistrict, district, city, province, zip").
 * Counted from the end: drop a trailing postal code, then take the two parts before the province,
 * so a missing subdistrict or a comma inside one never shifts the result. A shorter label is
 * already "district, city" or a single area name: it is printed from its cleaned parts — never
 * the raw label, which could carry the postal code or empty segments (T-193) — and a label with
 * no area name at all reads "—". The full label stays on detail.
 */
export function formatDistrictCity(areaLabel: string) {
  const parts = areaLabel.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length > 0 && /^\d{5}$/.test(parts[parts.length - 1])) parts.pop();
  if (parts.length >= 3) return parts.slice(-3, -1).join(", ");
  return parts.length > 0 ? parts.join(", ") : "—";
}

/**
 * Presentation-only casing for area text (V-28): the provider sends some areas in
 * UPPERCASE ("COBLONG, BANDUNG") and others in Title Case. A comma segment written
 * entirely in capitals is shown in Title Case; mixed-case segments are left as stored.
 * The stored label is never changed.
 */
export function areaDisplayCase(text: string) {
  return text
    .split(",")
    .map((segment) => /\p{Lu}/u.test(segment) && segment === segment.toUpperCase()
      ? segment.toLowerCase()
        .replace(/(^|[\s(\-/.])(\p{L})/gu, (_, lead: string, letter: string) => lead + letter.toUpperCase())
        .replace(/\b(Dki|Diy|Ntb|Ntt)\b/g, (acronym) => acronym.toUpperCase())
      : segment)
    .join(",");
}

/**
 * Postal code from a Mengantar area label ("subdistrict, district, city, province, zip"),
 * read from the trailing part so a comma inside an earlier segment never shifts the
 * result (mirrors `formatDistrictCity`'s counted-from-the-end rule). Returns null when
 * the label has no five-digit trailing segment (label predates postal code, or missing).
 */
export function formatPostalCode(areaLabel: string | null) {
  if (!areaLabel) return null;
  const parts = areaLabel.split(",").map((part) => part.trim()).filter(Boolean);
  const last = parts[parts.length - 1];
  return last && /^\d{5}$/.test(last) ? last : null;
}
