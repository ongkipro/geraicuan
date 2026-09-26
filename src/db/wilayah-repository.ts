import "server-only";

import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type * as schema from "@/db/schema";
import {
  type WilayahRegencyKind,
  wilayahRegencyLabel,
} from "@/lib/wilayah";

type Database = NodePgDatabase<typeof schema>;

export const WILAYAH_SEARCH_LIMIT = 20;
const WILAYAH_CODE_PATTERN = /^[0-9]{2}\.[0-9]{2}\.[0-9]{2}(\.[0-9]{4})?$/;

/** One suggestion row. Display and search help only: it carries no provider id. */
export type WilayahSuggestion = {
  code: string;
  kind: "KECAMATAN" | "KELURAHAN" | "DESA";
  villageName: string | null;
  districtName: string;
  regencyLabel: string;
  provinceName: string;
  postalCode: string | null;
};

export type WilayahAreaRecord = {
  code: string;
  level: 3 | 4;
  villageName: string | null;
  districtName: string;
  regencyName: string;
  regencyKind: WilayahRegencyKind;
  provinceName: string;
  postalCode: string | null;
};

type Row = {
  code: string;
  level: number;
  village_name: string | null;
  village_kind: "KELURAHAN" | "DESA" | null;
  district_name: string;
  regency_name: string;
  regency_kind: WilayahRegencyKind;
  province_name: string;
  postal_code: string | null;
};

/**
 * T-245 (DATA-22): local suggestions for normalized query words (`wilayahQueryTokens`). Every word
 * must start a word of the row (trigram-indexed `LIKE '% word%'`). Ranking: exact kode pos, then
 * the row's own name equal to / starting with the query, then the query naming the row plus more
 * words ("coblong bandung"), then rows inside a matching kecamatan, then the rest; kecamatan before
 * kelurahan/desa, then name. No tenant scope: the table is tenant-neutral reference data.
 */
export async function searchWilayahAreas(
  db: Database,
  tokens: string[],
  limit = WILAYAH_SEARCH_LIMIT,
): Promise<WilayahSuggestion[]> {
  if (tokens.length === 0 || tokens.some((token) => !/^[a-z0-9]{1,40}$/.test(token))) return [];
  const full = tokens.join(" ");
  const postal = /^[1-9][0-9]{4}$/.test(full) ? full : null;
  const matches = sql.join(tokens.map((token) => sql`search_text LIKE ${`% ${token}%`}`), sql` AND `);
  const result = await db.execute<Row>(sql`
    SELECT code, level, village_name, village_kind, district_name, regency_name, regency_kind,
      province_name, postal_code
    FROM wilayah_areas
    WHERE ${matches}
    ORDER BY
      CASE
        WHEN ${postal}::text IS NOT NULL AND postal_code = ${postal}::text THEN 0
        WHEN name_search = ${full} THEN 1
        WHEN name_search LIKE ${`${full}%`} THEN 2
        WHEN ${full} LIKE name_search || ' %' THEN 3
        WHEN district_search = ${full} OR district_search LIKE ${`${full}%`} OR ${full} LIKE district_search || ' %' THEN 4
        ELSE 5
      END,
      level,
      name_search COLLATE "C",
      regency_name COLLATE "C",
      code COLLATE "C"
    LIMIT ${Math.min(Math.max(limit, 1), 50)}
  `);
  return result.rows.map((row) => ({
    code: row.code,
    districtName: row.district_name,
    kind: row.level === 3 ? "KECAMATAN" : row.village_kind === "KELURAHAN" ? "KELURAHAN" : "DESA",
    postalCode: row.postal_code,
    provinceName: row.province_name,
    regencyLabel: wilayahRegencyLabel(row.regency_kind, row.regency_name),
    villageName: row.village_name,
  }));
}

/** The row behind a picked suggestion, read server-side so client-sent names are never trusted. */
export async function findWilayahArea(db: Database, code: string): Promise<WilayahAreaRecord | null> {
  if (!WILAYAH_CODE_PATTERN.test(code)) return null;
  const result = await db.execute<Row>(sql`
    SELECT code, level, village_name, village_kind, district_name, regency_name, regency_kind,
      province_name, postal_code
    FROM wilayah_areas
    WHERE code = ${code}
  `);
  const row = result.rows[0];
  if (!row) return null;
  return {
    code: row.code,
    districtName: row.district_name,
    level: row.level === 3 ? 3 : 4,
    postalCode: row.postal_code,
    provinceName: row.province_name,
    regencyKind: row.regency_kind,
    regencyName: row.regency_name,
    villageName: row.village_name,
  };
}
