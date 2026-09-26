// T-245 (D-32): turn a picked wilayah suggestion into Mengantar provider options. Pure: which
// keywords to send (at most three) and which provider options strictly match the picked area.
// The provider option — never the wilayah row — is what gets validated and stored.
import type { MengantarDestinationAreaOption } from "@/lib/mengantar-locations";
import { normalizeWilayahText, wilayahRegencyBaseName, type WilayahRegencyKind } from "@/lib/wilayah";

export const MAX_RESOLVE_ATTEMPTS = 3;

export type WilayahResolveTarget = {
  level: 3 | 4;
  villageName: string | null;
  districtName: string;
  regencyName: string;
  regencyKind: WilayahRegencyKind;
  postalCode: string | null;
};

// Kemendagri vs Mengantar spellings, carried over from the adsbookcms resolution audit (its BUILD-LOG
// entry 156: 6,690 exact, 583 via same-city alternatives, 11 unavailable of 7,285 kecamatan).
const CITY_CANONICAL_ALIASES: Record<string, string> = {
  "fakfak": "fak fak",
  "gunung kidul": "gunungkidul",
  "kep siau tagulandang biaro": "siau tagulandang biaro",
  "kepulauan siau tagulandang biaro": "siau tagulandang biaro",
  "kepulauan siau tagulandang biaro sitaro": "siau tagulandang biaro",
  "maluku tenggara barat": "kepulauan tanimbar",
  "mamuju utara": "pasangkayu",
  "muko muko": "mukomuko",
  "padang sidempuan": "padangsidimpuan",
  "padang sidimpuan": "padangsidimpuan",
  "palangka raya": "palangkaraya",
  "pangkajene kepulauan": "pangkajene dan kepulauan",
  "toba samosir": "toba",
};

const compact = (value: string) => value.replace(/\s+/gu, "");

function canonicalCity(value: string) {
  const normalized = normalizeWilayahText(wilayahRegencyBaseName(value)).replace(/\bsidempuan\b/gu, "sidimpuan");
  return compact(CITY_CANONICAL_ALIASES[normalized] ?? normalized);
}

function canonicalDistrict(value: string) {
  return compact(normalizeWilayahText(value).replace(/^(?:kecamatan|kec)\s+/u, "").replace(/\bsidempuan\b/gu, "sidimpuan"));
}

/** The kind a provider city name states, if it states one ("Kota Bandung", "Kab. Bekasi"). */
function statedKind(city: string): WilayahRegencyKind | null {
  const normalized = normalizeWilayahText(city);
  if (/^kota\s/u.test(normalized)) return "KOTA";
  if (/^(?:kab|kabupaten)\s/u.test(normalized)) return "KAB";
  return null;
}

type ProviderAreaParts = { village: string; district: string; city: string; province: string; zip: string };

/** Splits a provider label ("Kelurahan, Kecamatan, Kota, Provinsi, ZIP") from the right. */
export function providerAreaParts(label: string): ProviderAreaParts | null {
  const parts = label.split(", ");
  if (parts.length < 5) return null;
  const zip = parts.pop()!;
  const province = parts.pop()!;
  const city = parts.pop()!;
  const district = parts.pop()!;
  return { city, district, province, village: parts.join(", "), zip };
}

/** Up to three provider keywords, most specific first, each within the provider's 3–100 limit. */
export function wilayahResolveKeywords(target: WilayahResolveTarget): string[] {
  const district = target.districtName.trim();
  const city = wilayahRegencyBaseName(target.regencyName);
  const keywords = [
    target.level === 4 && target.villageName ? `${target.villageName.trim()} ${district}` : null,
    `${district} ${city}`,
    district,
  ];
  return [...new Set(keywords.filter((keyword): keyword is string => (
    keyword !== null && keyword.length >= 3 && keyword.length <= 100
  )))].slice(0, MAX_RESOLVE_ATTEMPTS);
}

export type WilayahProviderMatch =
  | { kind: "single"; option: MengantarDestinationAreaOption }
  | { kind: "several"; options: MengantarDestinationAreaOption[] }
  | { kind: "none" };

/**
 * Strict matching. An option belongs to the picked area only when its kecamatan and its city
 * (aliases applied; a stated Kab./Kota must agree) both match. For a picked kelurahan/desa, exactly
 * one option with that kelurahan name is a "single" match (auto-selected); more than one is
 * ambiguous and never auto-picked. Everything else that matches kecamatan + city is offered as a
 * short list for the person to choose. Kode pos only orders the list; it never decides.
 */
export function matchProviderOptions(
  target: WilayahResolveTarget,
  options: MengantarDestinationAreaOption[],
): WilayahProviderMatch {
  const district = canonicalDistrict(target.districtName);
  const city = canonicalCity(target.regencyName);
  const village = target.villageName ? compact(normalizeWilayahText(target.villageName)) : null;
  const inArea = options.flatMap((option) => {
    const parts = providerAreaParts(option.areaLabel);
    if (!parts) return [];
    const kind = statedKind(parts.city);
    if (kind && kind !== target.regencyKind) return [];
    if (canonicalDistrict(parts.district) !== district || canonicalCity(parts.city) !== city) return [];
    return [{ option, parts }];
  });
  const byZip = (entries: typeof inArea) => [...entries].sort((left, right) => (
    Number(right.parts.zip === target.postalCode) - Number(left.parts.zip === target.postalCode)
  )).map((entry) => entry.option);

  if (target.level === 4 && village) {
    const exact = inArea.filter((entry) => compact(normalizeWilayahText(entry.parts.village)) === village);
    if (exact.length === 1) return { kind: "single", option: exact[0].option };
    if (exact.length > 1) return { kind: "several", options: byZip(exact) };
  }
  return inArea.length > 0 ? { kind: "several", options: byZip(inArea) } : { kind: "none" };
}
