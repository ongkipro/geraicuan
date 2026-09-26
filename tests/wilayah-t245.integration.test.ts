import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import { searchWilayahAreas } from "@/db/wilayah-repository";
import {
  buildWilayahRows,
  replaceWilayahRows,
  WilayahImportError,
  wilayahQueryTokens,
} from "@/lib/wilayah";
import { matchProviderOptions, MAX_RESOLVE_ATTEMPTS, wilayahResolveKeywords } from "@/lib/wilayah-match";

import { readVendoredWilayah, wilayahFingerprint } from "../scripts/wilayah-import.mjs";
import { ensureIntegrationRuntimeRole } from "./integration-runtime-role";
import {
  WILAYAH_FIXTURE_NAMES,
  WILAYAH_FIXTURE_POSTAL,
  WILAYAH_FIXTURE_VERSION,
} from "./fixtures/wilayah-subset";

/**
 * T-245 (DATA-22, D-32): the local wilayah reference. Import validation, search ranking and
 * Kab./Kota disambiguation on a fixture subset (never the full import: the suite shares its test
 * database), the runtime role's SELECT-only access, the guarded provider resolve, and the
 * unchanged authority: a wilayah code is never accepted where a provider area id is required.
 */

const OUTLET_ID = "00000000-0000-4000-8000-000000000642";

const mocks = vi.hoisted(() => ({
  authorizationDenied: false,
  fetchCalls: [] as string[],
  providerAreas: [] as Array<{ areaId: string; areaLabel: string }>,
  rateAttempts: 0,
  rateLimited: false,
}));

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`REDIRECT:${href}`);
  }),
}));
vi.mock("@/lib/cms-auth", () => {
  class CmsAuthorizationDeniedError extends Error {}
  return {
    CmsAuthorizationDeniedError,
    requireCmsScope: vi.fn(async () => {
      if (mocks.authorizationDenied) throw new CmsAuthorizationDeniedError();
      return { role: "OPERATOR", scope: "tenant", tenantId: "00000000-0000-4000-8000-000000000641", userId: "wilayah-operator" };
    }),
  };
});
vi.mock("@/db/tenant-context", () => ({
  withTenantContext: vi.fn(async (_db, userId, tenantId, callback) => callback({}, { role: "OPERATOR", tenantId, userId })),
}));
vi.mock("@/lib/location-search-rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/location-search-rate-limit")>();
  return {
    ...actual,
    enforceLocationSearchRateLimit: vi.fn(async () => {
      mocks.rateAttempts += 1;
      if (mocks.rateLimited) throw new actual.LocationSearchRateLimitedError();
    }),
    withLocationSearchConcurrencyGuard: vi.fn(async (_pool, _context, work) => work()),
  };
});
vi.mock("@/lib/mengantar-credentials", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mengantar-credentials")>();
  const authority = { connectionUpdatedAt: null, source: "platform_default", version: 1 };
  return {
    ...actual,
    resolveMengantarAccountCredentials: vi.fn(async () => ({
      authority,
      credentials: { apiKey: "sanitized-fixture-key", baseUrl: "https://api-public.mengantar.com", pickupAddressId: "unused" },
    })),
    sameMengantarAccountAuthority: () => true,
  };
});
vi.mock("@/lib/mengantar-locations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mengantar-locations")>();
  return {
    ...actual,
    // Sanitized fixture options in the provider's label shape; the real fetch is never reached.
    fetchMengantarDestinationAreas: vi.fn(async (_credentials, query: string) => {
      mocks.fetchCalls.push(query);
      return mocks.providerAreas;
    }),
  };
});

import {
  resolveWilayahDestinationArea,
  searchWilayahDestinationAreas,
  validateMengantarDestinationAreaSelection,
} from "@/app/app/location-actions";

const adminDatabaseUrl = process.env.DATABASE_URL;
const appDatabaseUrl = process.env.APP_DATABASE_URL;
if (!adminDatabaseUrl || !appDatabaseUrl) {
  throw new Error("DATABASE_URL and APP_DATABASE_URL are required for integration tests.");
}
if (new URL(adminDatabaseUrl).hostname !== "127.0.0.1" || new URL(adminDatabaseUrl).pathname !== "/geraicuan_test") {
  throw new Error("Integration tests require the isolated localhost geraicuan_test database.");
}
const adminPool = new Pool({ connectionString: adminDatabaseUrl });
const appPool = new Pool({ connectionString: appDatabaseUrl });
const appDb = drizzle({ client: appPool, schema });

function fixtureRows() {
  return buildWilayahRows(WILAYAH_FIXTURE_NAMES, WILAYAH_FIXTURE_POSTAL, WILAYAH_FIXTURE_VERSION);
}

async function loadFixture() {
  const { rows } = fixtureRows();
  const client = await adminPool.connect();
  try {
    return await replaceWilayahRows(client, rows, wilayahFingerprint(rows));
  } finally {
    client.release();
  }
}

async function search(query: string) {
  return searchWilayahAreas(appDb, wilayahQueryTokens(query) ?? []);
}

const label = (row: { villageName: string | null; districtName: string; regencyLabel: string }) =>
  [row.villageName, row.districtName, row.regencyLabel].filter(Boolean).join(", ");

beforeAll(async () => {
  await ensureIntegrationRuntimeRole(adminPool, appDatabaseUrl);
  await loadFixture();
});

afterAll(async () => {
  await appPool.end();
  await adminPool.end();
});

beforeEach(() => {
  mocks.authorizationDenied = false;
  mocks.fetchCalls.length = 0;
  mocks.providerAreas = [];
  mocks.rateAttempts = 0;
  mocks.rateLimited = false;
});

describe("wilayah import validation", () => {
  it("builds kecamatan and kelurahan rows, keeps Kab./Kota apart, and reports villages without kode pos", () => {
    const { report, rows } = fixtureRows();
    expect(report).toEqual({ districts: 9, provinces: 4, regencies: 8, villages: 14, villagesWithoutPostal: 1 });
    expect(rows).toHaveLength(23);
    const tarumajaya = rows.find((row) => row.code === "32.16.01")!;
    const bekasiBarat = rows.find((row) => row.code === "32.75.02")!;
    expect([tarumajaya.regencyKind, bekasiBarat.regencyKind]).toEqual(["KAB", "KOTA"]);
    expect(rows.find((row) => row.code === "32.73.02.1006")).toMatchObject({ postalCode: null, villageKind: "KELURAHAN" });
    expect(rows.find((row) => row.code === "96.01.18.2001")).toMatchObject({ villageKind: "DESA" });
  });

  it.each([
    ["an orphan village", [...WILAYAH_FIXTURE_NAMES, ["32.73.09.1001", "Tanpa Induk"]], WILAYAH_FIXTURE_POSTAL, /orphan 32\.73\.09\.1001/],
    ["a duplicate code", [...WILAYAH_FIXTURE_NAMES, ["32.73.02.1004", "Dago Lagi"]], WILAYAH_FIXTURE_POSTAL, /duplicate code 32\.73\.02\.1004/],
    ["a malformed kode pos", WILAYAH_FIXTURE_NAMES, [...WILAYAH_FIXTURE_POSTAL.filter(([code]) => code !== "32.73.02.1004"), ["32.73.02.1004", "0135"]], /invalid kode pos for 32\.73\.02\.1004/],
    ["a kode pos for an unknown village", WILAYAH_FIXTURE_NAMES, [...WILAYAH_FIXTURE_POSTAL, ["32.73.02.1099", "40135"]], /unknown village 32\.73\.02\.1099/],
    ["a Kota coded as a Kabupaten", WILAYAH_FIXTURE_NAMES.map(([code, name]) => [code, code === "32.75" ? "Kabupaten Bekasi" : name] as const), WILAYAH_FIXTURE_POSTAL, /regency kind of 32\.75/],
    ["a control character", [...WILAYAH_FIXTURE_NAMES, ["32.73.02.1007", "Dago\u0007"]], WILAYAH_FIXTURE_POSTAL, /invalid name for 32\.73\.02\.1007/],
  ] as const)("refuses the whole dataset for %s", (_case, names, postal, problem) => {
    let caught: unknown;
    try {
      buildWilayahRows(names, postal, WILAYAH_FIXTURE_VERSION);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(WilayahImportError);
    expect((caught as WilayahImportError).problems.join("\n")).toMatch(problem);
  });

  it("refuses a dataset whose counts differ from the published ones", () => {
    expect(() => buildWilayahRows(WILAYAH_FIXTURE_NAMES, WILAYAH_FIXTURE_POSTAL, WILAYAH_FIXTURE_VERSION, {
      districts: 7285, provinces: 38, regencies: 514, villages: 83762,
    })).toThrow(/expected 7285 districts, found 9/);
  });

  it("verifies the vendored files against SOURCE.json and the published counts", async () => {
    const { names, postal, source } = await readVendoredWilayah();
    const { report, rows } = buildWilayahRows(names, postal, source.datasetVersion, source.expected);
    expect(report).toEqual({ districts: 7285, provinces: 38, regencies: 514, villages: 83762, villagesWithoutPostal: 0 });
    expect(rows).toHaveLength(91047);
    expect(source.sources.map((entry: { commit: string }) => entry.commit)).toEqual([
      "0d1237a5eef926629c69d287cf2282006144f4fa",
      "ba8497156c5cc9bcbfc527f7b8875d403eda2354",
    ]);
  });

  it("refuses a vendored file changed after its checksum was recorded", async () => {
    const directory = await mkdtemp(join(tmpdir(), "wilayah-t245-"));
    try {
      await cp("data/wilayah", directory, { recursive: true });
      const packed = await readFile(join(directory, "kodepos.tsv.gz"));
      packed[packed.length - 5] ^= 0xff;
      await writeFile(join(directory, "kodepos.tsv.gz"), packed);
      await expect(readVendoredWilayah(directory)).rejects.toThrow(/kodepos\.tsv\.gz does not match its SOURCE\.json checksum/);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});

describe("wilayah import transaction", () => {
  it("is idempotent, and a failed post-load check rolls back to the previous rows", async () => {
    const again = await loadFixture();
    expect(again).toMatchObject({ added: 0, changed: 0, removed: 0, rows: 23 });

    const { rows } = fixtureRows();
    const client = await adminPool.connect();
    try {
      await expect(replaceWilayahRows(client, rows.slice(0, 10), wilayahFingerprint(rows)))
        .rejects.toThrow(/post-load check failed/);
    } finally {
      client.release();
    }
    const { rows: [count] } = await adminPool.query<{ n: number }>("SELECT count(*)::int AS n FROM wilayah_areas");
    expect(count.n).toBe(23);
  });
});

describe("runtime role access", () => {
  it("reads the reference but cannot insert, update or delete it", async () => {
    const { rows } = await appPool.query<{ n: number }>("SELECT count(*)::int AS n FROM wilayah_areas");
    expect(rows[0].n).toBe(23);
    for (const statement of [
      "INSERT INTO wilayah_areas (code, level, district_code, regency_code, district_name, regency_name, regency_kind, province_name, search_text, name_search, district_search, dataset_version) VALUES ('32.73.99', 3, '32.73.99', '32.73', 'X', 'Kota Bandung', 'KOTA', 'Jawa Barat', ' x', 'x', 'x', 'forged')",
      "UPDATE wilayah_areas SET postal_code = '40999' WHERE code = '32.73.02.1004'",
      "DELETE FROM wilayah_areas WHERE code = '32.73.02.1004'",
    ]) {
      await expect(appPool.query(statement), statement.slice(0, 20)).rejects.toMatchObject({ code: "42501" });
    }
    const { rows: [privileges] } = await adminPool.query<{ grants: string; forced: boolean }>(`
      SELECT (SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) FROM information_schema.role_table_grants
        WHERE table_name = 'wilayah_areas' AND grantee = 'geraicuan_app') AS grants,
        (SELECT relforcerowsecurity FROM pg_class WHERE relname = 'wilayah_areas') AS forced`);
    expect(privileges).toEqual({ forced: true, grants: "SELECT" });
  });
});

describe("local wilayah search", () => {
  it("answers a kode pos with its kelurahan first", async () => {
    const [first] = await search("40135");
    expect(first).toMatchObject({ code: "32.73.02.1004", kind: "KELURAHAN", postalCode: "40135", villageName: "Dago" });
  });

  it("ranks the kecamatan itself before its kelurahan, with or without the city", async () => {
    for (const query of ["coblong", "Kec. Coblong", "coblong bandung"]) {
      const results = await search(query);
      expect(results[0], query).toMatchObject({ code: "32.73.02", kind: "KECAMATAN", regencyLabel: "Kota Bandung" });
      expect(results.slice(1).every((row) => row.districtName === "Coblong"), query).toBe(true);
    }
    expect((await search("  DAGO ")).at(0)).toMatchObject({ code: "32.73.02.1004" });
    expect((await search("lebak siliwangi")).at(0)).toMatchObject({ code: "32.73.02.1006", postalCode: null });
  });

  it("keeps Kab. Bekasi and Kota Bekasi apart, and a stated Kab./Kota narrows to it", async () => {
    const both = (await search("bekasi")).map((row) => row.regencyLabel);
    expect(new Set(both)).toEqual(new Set(["Kab. Bekasi", "Kota Bekasi"]));
    expect((await search("kab bekasi")).map((row) => row.regencyLabel).every((value) => value === "Kab. Bekasi")).toBe(true);
    expect((await search("kab bekasi")).length).toBeGreaterThan(0);
    expect((await search("kota bekasi")).map((row) => row.regencyLabel)).toEqual(["Kota Bekasi", "Kota Bekasi"]);
    expect((await search("tarumajaya")).map(label)).toEqual([
      "Tarumajaya, Kab. Bekasi",
      "Sagara Makmur, Tarumajaya, Kab. Bekasi",
      "Setia Asih, Tarumajaya, Kab. Bekasi",
    ]);
  });

  it("returns every regency of a kecamatan name shared across cities", async () => {
    const karanganyar = (await search("karanganyar")).filter((row) => row.kind === "KECAMATAN");
    expect(karanganyar.map((row) => [row.code, row.regencyLabel])).toEqual([
      ["33.13.09", "Kab. Karanganyar"],
      ["33.05.20", "Kab. Kebumen"],
    ]);
    const sorong = (await search("sorong")).filter((row) => row.kind === "KECAMATAN");
    expect(sorong.map((row) => row.regencyLabel).sort()).toEqual(["Kab. Sorong", "Kota Sorong"]);
  });

  it("rejects queries that are too short, too long, or carry control characters", () => {
    expect(wilayahQueryTokens("ab")).toBeNull();
    expect(wilayahQueryTokens("x".repeat(101))).toBeNull();
    expect(wilayahQueryTokens("dago\u0000")).toBeNull();
    expect(wilayahQueryTokens("kec")).toEqual(["kec"]);
    // A regency kind alone matches most of the full table; it only narrows another word.
    expect(wilayahQueryTokens("Kab.")).toBeNull();
    expect(wilayahQueryTokens("kota")).toBeNull();
    expect(wilayahQueryTokens("kota bekasi")).toEqual(["kota", "bekasi"]);
  });
});

describe("searchWilayahDestinationAreas Server Action", () => {
  it("serves suggestions from the database with no provider call and no durable rate-limit write", async () => {
    const result = await searchWilayahDestinationAreas("dago");
    expect(result.success).toBe(true);
    expect(result.suggestions[0]).toMatchObject({ code: "32.73.02.1004", regencyLabel: "Kota Bandung" });
    expect(mocks.fetchCalls).toHaveLength(0);
    expect(mocks.rateAttempts).toBe(0);
  });

  it("denies an unauthenticated caller before reading anything", async () => {
    mocks.authorizationDenied = true;
    await expect(searchWilayahDestinationAreas("dago")).rejects.toThrow("REDIRECT:/login/tenant");
    await expect(resolveWilayahDestinationArea(OUTLET_ID, "32.73.02.1004")).rejects.toThrow("REDIRECT:/login/tenant");
    expect(mocks.fetchCalls).toHaveLength(0);
  });
});

describe("resolveWilayahDestinationArea", () => {
  const dago = { areaId: "mengantar-dago", areaLabel: "Dago, Coblong, Kota Bandung, Jawa Barat, 40135" };
  const sekeloa = { areaId: "mengantar-sekeloa", areaLabel: "Sekeloa, Coblong, Kota Bandung, Jawa Barat, 40134" };

  it("auto-selects exactly one strict match with one provider call, and returns the keyword that found it", async () => {
    mocks.providerAreas = [sekeloa, dago];
    const result = await resolveWilayahDestinationArea(OUTLET_ID, "32.73.02.1004");
    expect(result).toEqual({ option: dago, query: "Dago Coblong", status: "matched" });
    expect(mocks.fetchCalls).toEqual(["Dago Coblong"]);
    expect(mocks.rateAttempts).toBe(1);
  });

  it("matches a Mengantar city spelling through the alias table", async () => {
    mocks.providerAreas = [{ areaId: "mengantar-pahandut", areaLabel: "Pahandut, Pahandut, Palangka Raya, Kalimantan Tengah, 73111" }];
    await expect(resolveWilayahDestinationArea(OUTLET_ID, "62.71.01.1001"))
      .resolves.toMatchObject({ option: { areaId: "mengantar-pahandut" }, status: "matched" });
  });

  it("never auto-picks an ambiguous answer: two same-named kelurahan, or a kecamatan pick", async () => {
    // The provider states no Kab./Kota: "Remu, Sorong, Sorong" could be either regency.
    mocks.providerAreas = [
      { areaId: "mengantar-remu-a", areaLabel: "Remu, Sorong, Sorong, Papua Barat Daya, 98414" },
      { areaId: "mengantar-remu-b", areaLabel: "Remu, Sorong, Sorong, Papua Barat Daya, 98415" },
      { areaId: "mengantar-remu-kab", areaLabel: "Remu, Sorong, Kab. Sorong, Papua Barat Daya, 98446" },
    ];
    const remu = await resolveWilayahDestinationArea(OUTLET_ID, "96.71.01.1004");
    expect(remu.status).toBe("choose");
    // A stated "Kab." never matches a Kota pick; kode pos only orders the list.
    expect(remu.status === "choose" && remu.options.map((option) => option.areaId)).toEqual(["mengantar-remu-a", "mengantar-remu-b"]);

    mocks.providerAreas = [sekeloa, dago];
    const coblong = await resolveWilayahDestinationArea(OUTLET_ID, "32.73.02");
    expect(coblong).toMatchObject({ query: "Coblong Bandung", status: "choose" });
  });

  it("tries at most three keywords, spending the rate limit on each, then falls back", async () => {
    mocks.providerAreas = [{ areaId: "elsewhere", areaLabel: "Dago, Parongpong, Kab. Bandung Barat, Jawa Barat, 40559" }];
    const result = await resolveWilayahDestinationArea(OUTLET_ID, "32.73.02.1004");
    expect(result.status).toBe("not_found");
    expect(mocks.fetchCalls).toEqual(["Dago Coblong", "Coblong Bandung", "Coblong"]);
    expect(mocks.fetchCalls.length).toBeLessThanOrEqual(MAX_RESOLVE_ATTEMPTS);
    expect(mocks.rateAttempts).toBe(3);
  });

  it("stops at the first refusal and does not call the provider for an unknown code", async () => {
    mocks.rateLimited = true;
    await expect(resolveWilayahDestinationArea(OUTLET_ID, "32.73.02.1004"))
      .resolves.toMatchObject({ error: "rate_limited", status: "error" });
    expect(mocks.fetchCalls).toHaveLength(0);
    expect(mocks.rateAttempts).toBe(1);

    mocks.rateLimited = false;
    for (const code of ["32.73.02.9999", "'; DROP TABLE wilayah_areas; --", "32"]) {
      await expect(resolveWilayahDestinationArea(OUTLET_ID, code)).resolves.toMatchObject({ status: "error" });
    }
    expect(mocks.fetchCalls).toHaveLength(0);
  });

  it("keeps the pure matcher strict on the kecamatan as well as the city", () => {
    const target = { districtName: "Coblong", level: 4 as const, postalCode: "40135", regencyKind: "KOTA" as const, regencyName: "Kota Bandung", villageName: "Dago" };
    expect(matchProviderOptions(target, [{ areaId: "x", areaLabel: "Dago, Cidadap, Kota Bandung, Jawa Barat, 40135" }])).toEqual({ kind: "none" });
    expect(wilayahResolveKeywords(target)).toEqual(["Dago Coblong", "Coblong Bandung", "Coblong"]);
  });
});

describe("destination authority is unchanged (D-32)", () => {
  it("refuses a wilayah code posted in place of the provider area id", async () => {
    mocks.providerAreas = [{ areaId: "mengantar-dago", areaLabel: "Dago, Coblong, Kota Bandung, Jawa Barat, 40135" }];
    const forged = await validateMengantarDestinationAreaSelection(
      OUTLET_ID,
      "Dago Coblong",
      "32.73.02.1004",
      "Dago, Coblong, Kota Bandung, Jawa Barat, 40135",
    );
    expect(forged).toMatchObject({ error: "selection_mismatch", success: false });
    expect(forged).not.toHaveProperty("option");

    const genuine = await validateMengantarDestinationAreaSelection(
      OUTLET_ID,
      "Dago Coblong",
      "mengantar-dago",
      "Dago, Coblong, Kota Bandung, Jawa Barat, 40135",
    );
    expect(genuine).toMatchObject({ option: { areaId: "mengantar-dago" }, success: true });
  });
});
