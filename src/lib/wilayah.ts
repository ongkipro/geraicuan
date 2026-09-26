// T-245 (DATA-22, D-32): the Kemendagri wilayah reference — normalization shared by the import
// (`scripts/wilayah-import.mjs`, run by Node's type stripping, hence no imports and only erasable
// syntax here) and the local search. Suggestion data only: nothing here is a destination authority.

export type WilayahLevel = 3 | 4;
export type WilayahRegencyKind = "KAB" | "KOTA";
export type WilayahVillageKind = "KELURAHAN" | "DESA";

export type WilayahAreaRow = {
  code: string;
  level: WilayahLevel;
  districtCode: string;
  regencyCode: string;
  villageName: string | null;
  villageKind: WilayahVillageKind | null;
  districtName: string;
  regencyName: string;
  regencyKind: WilayahRegencyKind;
  provinceName: string;
  postalCode: string | null;
  searchText: string;
  nameSearch: string;
  districtSearch: string;
  datasetVersion: string;
};

export type WilayahExpectedCounts = {
  provinces: number;
  regencies: number;
  districts: number;
  villages: number;
};

export type WilayahBuildReport = WilayahExpectedCounts & {
  villagesWithoutPostal: number;
};

export class WilayahImportError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`Wilayah data rejected: ${problems.slice(0, 10).join("; ")}${problems.length > 10 ? ` (+${problems.length - 10} more)` : ""}`);
    this.problems = problems;
  }
}

const CODE_PATTERNS: Record<number, RegExp> = {
  1: /^[0-9]{2}$/,
  2: /^[0-9]{2}\.[0-9]{2}$/,
  3: /^[0-9]{2}\.[0-9]{2}\.[0-9]{2}$/,
  4: /^[0-9]{2}\.[0-9]{2}\.[0-9]{2}\.[0-9]{4}$/,
};
const POSTAL_PATTERN = /^[1-9][0-9]{4}$/;
const CONTROL_PATTERN = /[\u0000-\u001f\u007f‪-‮⁦-⁩]/u;
const MAX_NAME_LENGTH = 100;
const MAX_SEARCH_TEXT_LENGTH = 400;

/** Lower-case ASCII words: accents dropped, apostrophes joined ("Ba'u" → "bau"), the rest split. */
export function normalizeWilayahText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/gu, "")
    .toLowerCase()
    .replace(/['’‘`]/gu, "")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

/** "Kabupaten Bekasi" → "Bekasi"; "Kota Administrasi Jakarta Pusat" → "Jakarta Pusat". */
export function wilayahRegencyBaseName(regencyName: string): string {
  return regencyName
    .trim()
    .replace(/^(?:kabupaten|kab\.?|kota)\s+/iu, "")
    .replace(/^(?:administrasi|administratif|adm\.?)\s+/iu, "");
}

/** The short form shown in suggestions, so Kab. and Kota of one name never look alike. */
export function wilayahRegencyLabel(regencyKind: WilayahRegencyKind, regencyName: string): string {
  return `${regencyKind === "KAB" ? "Kab." : "Kota"} ${wilayahRegencyBaseName(regencyName)}`;
}

function buildSearchText(parts: Array<string | null>) {
  const words = normalizeWilayahText(parts.filter(Boolean).join(" "));
  return ` ${words}`;
}

/** Query words dropped because every row would match them. `kab` / `kota` stay: they disambiguate. */
const QUERY_STOP_WORDS = new Set(["kec", "kecamatan", "kel", "kelurahan", "desa", "ds"]);
const REGENCY_KIND_WORDS = new Set(["kab", "kabupaten", "kota"]);
export const WILAYAH_QUERY_MIN_LENGTH = 3;
export const WILAYAH_QUERY_MAX_LENGTH = 100;
const MAX_QUERY_TOKENS = 6;
const MAX_TOKEN_LENGTH = 40;

/**
 * The normalized words of a search, or null when it is too short, too long or carries control
 * characters. Every word must start a word of the row (`search_text LIKE '% word%'`).
 */
export function wilayahQueryTokens(query: unknown): string[] | null {
  if (typeof query !== "string") return null;
  const trimmed = query.normalize("NFKC").trim();
  if (
    CONTROL_PATTERN.test(trimmed)
    || trimmed.length < WILAYAH_QUERY_MIN_LENGTH
    || trimmed.length > WILAYAH_QUERY_MAX_LENGTH
  ) {
    return null;
  }
  const words = normalizeWilayahText(trimmed).split(" ").filter(Boolean);
  const kept = words.filter((word) => !QUERY_STOP_WORDS.has(word));
  const tokens = [...new Set((kept.length > 0 ? kept : words).map((word) => word.slice(0, MAX_TOKEN_LENGTH)))]
    .slice(0, MAX_QUERY_TOKENS);
  if (tokens.join(" ").length < WILAYAH_QUERY_MIN_LENGTH) return null;
  // "kab" / "kota" alone match most of the table (≈95 ms on the full import); they only narrow.
  if (tokens.every((token) => REGENCY_KIND_WORDS.has(token))) return null;
  return tokens;
}

function levelOf(code: string) {
  return code.split(".").length;
}

/**
 * Builds and validates the level-3 and level-4 rows from upstream `[code, name]` pairs (every
 * level, 1–4) and `code → kode pos` pairs. Nothing is written when any rule fails: the error lists
 * every problem. `expected` pins the published counts so a truncated or mixed dataset is refused.
 */
export function buildWilayahRows(
  names: ReadonlyArray<readonly [string, string]>,
  postalCodes: ReadonlyArray<readonly [string, string]>,
  datasetVersion: string,
  expected?: WilayahExpectedCounts,
): { report: WilayahBuildReport; rows: WilayahAreaRow[] } {
  const problems: string[] = [];
  if (!/^[A-Za-z0-9][A-Za-z0-9.+@_-]{0,119}$/.test(datasetVersion)) problems.push("dataset version is not a plain token");

  const byCode = new Map<string, string>();
  for (const [code, rawName] of names) {
    const level = levelOf(code);
    if (!CODE_PATTERNS[level]?.test(code)) {
      problems.push(`invalid code ${JSON.stringify(code)}`);
      continue;
    }
    const name = typeof rawName === "string" ? rawName.trim().replace(/\s+/gu, " ") : "";
    if (!name || name.length > MAX_NAME_LENGTH || CONTROL_PATTERN.test(name)) {
      problems.push(`invalid name for ${code}`);
      continue;
    }
    if (byCode.has(code)) {
      problems.push(`duplicate code ${code}`);
      continue;
    }
    byCode.set(code, name);
  }

  const postalByCode = new Map<string, string>();
  for (const [code, postal] of postalCodes) {
    if (postalByCode.has(code)) problems.push(`duplicate kode pos for ${code}`);
    else if (!POSTAL_PATTERN.test(postal)) problems.push(`invalid kode pos for ${code}`);
    else if (levelOf(code) !== 4 || !byCode.has(code)) problems.push(`kode pos for unknown village ${code}`);
    else postalByCode.set(code, postal);
  }

  const counts = { provinces: 0, regencies: 0, districts: 0, villages: 0 };
  const rows: WilayahAreaRow[] = [];
  let villagesWithoutPostal = 0;
  for (const [code, name] of byCode) {
    const level = levelOf(code);
    if (level === 1) {
      counts.provinces += 1;
      continue;
    }
    const parent = code.slice(0, code.lastIndexOf("."));
    if (!byCode.has(parent)) {
      problems.push(`orphan ${code} (no parent ${parent})`);
      continue;
    }
    if (level === 2) {
      counts.regencies += 1;
      const kota = Number(code.slice(3, 5)) >= 71;
      if (kota !== /^kota\s/iu.test(name) || (!kota && !/^kabupaten\s/iu.test(name))) {
        problems.push(`regency kind of ${code} does not match its name`);
      }
      continue;
    }

    const districtCode = code.slice(0, 8);
    const regencyCode = code.slice(0, 5);
    const regencyName = byCode.get(regencyCode) ?? "";
    const provinceName = byCode.get(code.slice(0, 2)) ?? "";
    const districtName = byCode.get(districtCode) ?? "";
    const regencyKind: WilayahRegencyKind = Number(code.slice(3, 5)) >= 71 ? "KOTA" : "KAB";
    let villageKind: WilayahVillageKind | null = null;
    let villageName: string | null = null;
    let postalCode: string | null = null;
    if (level === 3) {
      counts.districts += 1;
    } else {
      counts.villages += 1;
      villageName = name;
      const kindDigit = code.charAt(9);
      // 1 = kelurahan, 2 = desa, 3 = desa adat (Kemendagri code convention).
      if (kindDigit === "1") villageKind = "KELURAHAN";
      else if (kindDigit === "2" || kindDigit === "3") villageKind = "DESA";
      else problems.push(`unknown village kind digit in ${code}`);
      postalCode = postalByCode.get(code) ?? null;
      if (!postalCode) villagesWithoutPostal += 1;
    }
    const searchText = buildSearchText([
      villageName,
      districtName,
      regencyName,
      provinceName,
      postalCode,
    ]);
    if (searchText.length > MAX_SEARCH_TEXT_LENGTH || searchText.trim().length === 0) {
      problems.push(`search text of ${code} is out of bounds`);
    }
    rows.push({
      code,
      level: level as WilayahLevel,
      districtCode,
      regencyCode,
      villageName,
      villageKind,
      districtName,
      regencyName,
      regencyKind,
      provinceName,
      postalCode,
      searchText,
      nameSearch: normalizeWilayahText(villageName ?? districtName),
      districtSearch: normalizeWilayahText(districtName),
      datasetVersion,
    });
  }

  if (expected) {
    for (const key of ["provinces", "regencies", "districts", "villages"] as const) {
      if (counts[key] !== expected[key]) problems.push(`expected ${expected[key]} ${key}, found ${counts[key]}`);
    }
  }
  if (problems.length > 0) throw new WilayahImportError(problems);

  rows.sort((left, right) => (left.code < right.code ? -1 : left.code > right.code ? 1 : 0));
  return { report: { ...counts, villagesWithoutPostal }, rows };
}

/** One canonical line per row, in code order: the import compares its md5 with the database's. */
export function wilayahRowFingerprintLine(row: WilayahAreaRow): string {
  return [
    row.code,
    String(row.level),
    row.districtCode,
    row.regencyCode,
    row.villageName ?? "",
    row.villageKind ?? "",
    row.districtName,
    row.regencyName,
    row.regencyKind,
    row.provinceName,
    row.postalCode ?? "",
    row.searchText,
    row.nameSearch,
    row.districtSearch,
    row.datasetVersion,
  ].join("\t");
}

/** The same fingerprint computed inside PostgreSQL over the table the import just wrote. */
export const WILAYAH_DATABASE_FINGERPRINT_SQL = `
  SELECT count(*)::int AS rows,
    coalesce(md5(string_agg(concat_ws(E'\\t', code, level::text, district_code, regency_code,
      coalesce(village_name, ''), coalesce(village_kind, ''), district_name, regency_name, regency_kind,
      province_name, coalesce(postal_code, ''), search_text, name_search, district_search, dataset_version),
      E'\\n' ORDER BY code COLLATE "C")), md5('')) AS md5
  FROM wilayah_areas`;

type Queryable = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number | null }>;
};

export type WilayahReplaceResult = {
  added: number;
  changed: number;
  removed: number;
  rows: number;
  md5: string;
};

const BATCH_SIZE = 5_000;

/**
 * Replaces the table's rows with `rows` in ONE transaction on `client` (the owner/migration role,
 * never the runtime role): stage into a temp table, delete what is gone, upsert what changed, then
 * assert the row count and the content fingerprint before COMMIT. Re-running with the same data
 * changes nothing. Any failure rolls back and leaves the previous rows untouched.
 */
export async function replaceWilayahRows(
  client: Queryable,
  rows: WilayahAreaRow[],
  expectedMd5: string,
): Promise<WilayahReplaceResult> {
  await client.query("BEGIN");
  try {
    await client.query("LOCK TABLE wilayah_areas IN EXCLUSIVE MODE");
    await client.query(`CREATE TEMP TABLE wilayah_import (LIKE wilayah_areas INCLUDING DEFAULTS INCLUDING CONSTRAINTS) ON COMMIT DROP`);
    for (let start = 0; start < rows.length; start += BATCH_SIZE) {
      const batch = rows.slice(start, start + BATCH_SIZE);
      const column = <K extends keyof WilayahAreaRow>(key: K) => batch.map((row) => row[key]);
      await client.query(
        `INSERT INTO wilayah_import (code, level, district_code, regency_code, village_name, village_kind,
          district_name, regency_name, regency_kind, province_name, postal_code, search_text, name_search,
          district_search, dataset_version)
        SELECT * FROM unnest($1::text[], $2::smallint[], $3::text[], $4::text[], $5::text[], $6::text[],
          $7::text[], $8::text[], $9::text[], $10::text[], $11::text[], $12::text[], $13::text[],
          $14::text[], $15::text[])`,
        [
          column("code"), column("level"), column("districtCode"), column("regencyCode"),
          column("villageName"), column("villageKind"), column("districtName"), column("regencyName"),
          column("regencyKind"), column("provinceName"), column("postalCode"), column("searchText"),
          column("nameSearch"), column("districtSearch"), column("datasetVersion"),
        ],
      );
    }
    const removed = await client.query(
      "DELETE FROM wilayah_areas w WHERE NOT EXISTS (SELECT 1 FROM wilayah_import i WHERE i.code = w.code)",
    );
    const { rows: [diff] } = await client.query(`
      SELECT
        count(*) FILTER (WHERE w.code IS NULL)::int AS added,
        count(*) FILTER (WHERE w.code IS NOT NULL AND (i.*) IS DISTINCT FROM (w.*))::int AS changed
      FROM wilayah_import i LEFT JOIN wilayah_areas w ON w.code = i.code`);
    await client.query(`
      INSERT INTO wilayah_areas SELECT * FROM wilayah_import
      ON CONFLICT (code) DO UPDATE SET
        level = EXCLUDED.level, district_code = EXCLUDED.district_code, regency_code = EXCLUDED.regency_code,
        village_name = EXCLUDED.village_name, village_kind = EXCLUDED.village_kind,
        district_name = EXCLUDED.district_name, regency_name = EXCLUDED.regency_name,
        regency_kind = EXCLUDED.regency_kind, province_name = EXCLUDED.province_name,
        postal_code = EXCLUDED.postal_code, search_text = EXCLUDED.search_text,
        name_search = EXCLUDED.name_search, district_search = EXCLUDED.district_search,
        dataset_version = EXCLUDED.dataset_version
      WHERE (wilayah_areas.*) IS DISTINCT FROM (EXCLUDED.*)`);
    const { rows: [fingerprint] } = await client.query(WILAYAH_DATABASE_FINGERPRINT_SQL);
    if (fingerprint.rows !== rows.length || fingerprint.md5 !== expectedMd5) {
      throw new WilayahImportError([
        `post-load check failed: ${String(fingerprint.rows)} rows (expected ${rows.length}), fingerprint ${fingerprint.md5 === expectedMd5 ? "matches" : "differs"}`,
      ]);
    }
    await client.query("COMMIT");
    return {
      added: Number(diff.added),
      changed: Number(diff.changed),
      md5: String(fingerprint.md5),
      removed: removed.rowCount ?? 0,
      rows: Number(fingerprint.rows),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
