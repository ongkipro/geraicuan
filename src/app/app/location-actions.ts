"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { db, dbPool } from "@/db/client";
import { listReadyShipmentOutlets } from "@/db/outlet-readiness-repository";
import {
  findWilayahArea,
  searchWilayahAreas,
  type WilayahSuggestion,
} from "@/db/wilayah-repository";
import { withTenantContext } from "@/db/tenant-context";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import {
  allowWilayahSearch,
  LocationSearchConcurrencyError,
  LocationSearchRateLimitedError,
  enforceLocationSearchRateLimit,
  withLocationSearchConcurrencyGuard,
} from "@/lib/location-search-rate-limit";
import {
  MengantarConfigurationError,
  type MengantarAccountAuthority,
  resolveMengantarAccountCredentials,
  sameMengantarAccountAuthority,
} from "@/lib/mengantar-credentials";
import {
  fetchMengantarDestinationAreas,
  MengantarLocationError,
  MengantarLocationQueryError,
  normalizeMengantarAreaQuery,
  type MengantarDestinationAreaOption,
} from "@/lib/mengantar-locations";
import {
  emitLocationSearchTiming,
  type LocationSearchOperation,
} from "@/lib/location-search-telemetry";
import { parseUiAuditScenario, UI_AUDIT_HEADER } from "@/lib/ui-audit-scenario";
import { wilayahQueryTokens } from "@/lib/wilayah";
import { matchProviderOptions, wilayahResolveKeywords } from "@/lib/wilayah-match";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type MengantarDestinationAreaSearchState = {
  error?: "busy" | "invalid_query" | "rate_limited" | "stale_authority" | "unavailable";
  message?: string;
  options: MengantarDestinationAreaOption[];
  success: boolean;
};

export type MengantarDestinationAreaValidationState = {
  authority?: MengantarAccountAuthority;
  error?: MengantarDestinationAreaSearchState["error"] | "selection_mismatch";
  message?: string;
  option?: MengantarDestinationAreaOption;
  success: boolean;
};

async function requireTenantPrincipal() {
  try {
    const principal = await requireCmsScope("tenant");
    if (principal.scope !== "tenant") redirect("/login/tenant");
    return principal;
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) redirect("/login/tenant");
    throw error;
  }
}

type InternalDestinationAreaSearchState = MengantarDestinationAreaSearchState & {
  authority?: MengantarAccountAuthority;
};

function failure(
  error: NonNullable<MengantarDestinationAreaSearchState["error"]>,
  message: string,
): MengantarDestinationAreaSearchState {
  return { error, message, options: [], success: false };
}

async function currentAuditScenario() {
  if (process.env.NODE_ENV !== "development") return null;
  try {
    return parseUiAuditScenario((await headers()).get(UI_AUDIT_HEADER));
  } catch {
    return null;
  }
}

type TenantPrincipal = Awaited<ReturnType<typeof requireTenantPrincipal>>;

/** T-245: the one provider-search path, timed; every caller goes through here. */
async function searchMengantarDestinationAreasInternal(
  outletId: string,
  query: string,
  operation: Extract<LocationSearchOperation, "provider_search" | "provider_validate" | "provider_resolve">,
): Promise<InternalDestinationAreaSearchState> {
  const started = performance.now();
  const principal = await requireTenantPrincipal();
  const timing: { providerMs?: number } = {};
  const result = await runProviderAreaSearch(principal, outletId, query, timing);
  emitLocationSearchTiming({
    actorId: principal.userId,
    operation,
    outcome: result.success ? (result.options.length > 0 ? "success" : "empty") : result.error ?? "unavailable",
    providerCalls: timing.providerMs === undefined ? 0 : 1,
    providerMs: timing.providerMs,
    queryLength: typeof query === "string" ? query.length : 0,
    resultCount: result.options.length,
    tenantId: principal.tenantId,
    totalMs: performance.now() - started,
  });
  return result;
}

async function runProviderAreaSearch(
  principal: TenantPrincipal,
  outletId: string,
  query: string,
  timing: { providerMs?: number },
): Promise<InternalDestinationAreaSearchState> {
  if (!UUID_PATTERN.test(outletId)) {
    return failure("unavailable", "Outlet tidak valid.");
  }

  let normalizedQuery: string;
  try {
    normalizedQuery = normalizeMengantarAreaQuery(query);
  } catch (error) {
    if (error instanceof MengantarLocationQueryError) {
      return failure(
        "invalid_query",
        "Masukkan 3 sampai 100 karakter lokasi tanpa karakter kontrol.",
      );
    }
    return failure("invalid_query", "Kata kunci lokasi tidak valid.");
  }

  const auditScenario = await currentAuditScenario();
  if (auditScenario?.startsWith("contacts-area-")) {
    try {
      await withTenantContext(
        db,
        principal.userId,
        principal.tenantId,
        async (tx, context) => {
          const fixtureOutletAuthorized = (await listReadyShipmentOutlets(tx, context))
            .some((outlet) => outlet.id === outletId);
          if (!fixtureOutletAuthorized) throw new MengantarConfigurationError();
        },
      );
    } catch {
      return failure("unavailable", "Outlet tidak valid atau belum siap.");
    }
  }
  if (auditScenario === "contacts-area-error") {
    return failure("unavailable", "Lokasi Mengantar belum dapat dimuat. Coba lagi.");
  }
  if (auditScenario === "contacts-area-no-result") {
    return { options: [], success: true };
  }
  if (auditScenario === "contacts-area-results") {
    return {
      options: [
        { areaId: "audit-area-1", areaLabel: "Dago, Coblong, Kota Bandung, Jawa Barat, 40135" },
        { areaId: "audit-area-2", areaLabel: "Sekeloa, Coblong, Kota Bandung, Jawa Barat, 40134" },
      ],
      success: true,
    };
  }

  try {
    const prepared = await withTenantContext(
      db,
      principal.userId,
      principal.tenantId,
      async (tx, context) => {
        await enforceLocationSearchRateLimit(tx, context);
        const resolved = await resolveMengantarAccountCredentials(
          tx,
          context,
          outletId,
        );
        return {
          authority: resolved.authority,
          credentials: resolved.credentials,
          context: { tenantId: context.tenantId, userId: context.userId },
        };
      },
    );

    const providerStarted = performance.now();
    let options: MengantarDestinationAreaOption[];
    try {
      options = await withLocationSearchConcurrencyGuard(
        dbPool,
        prepared.context,
        () => fetchMengantarDestinationAreas(
          prepared.credentials,
          normalizedQuery,
        ),
      );
    } finally {
      timing.providerMs = performance.now() - providerStarted;
    }
    const currentAuthority = await withTenantContext(
      db,
      principal.userId,
      principal.tenantId,
      async (tx, context) => (
        await resolveMengantarAccountCredentials(tx, context, outletId)
      ).authority,
    );
    if (!sameMengantarAccountAuthority(prepared.authority, currentAuthority)) {
      return failure(
        "stale_authority",
        "Koneksi Mengantar berubah. Cari ulang lokasi tujuan.",
      );
    }
    return { authority: currentAuthority, options, success: true };
  } catch (error) {
    if (error instanceof LocationSearchRateLimitedError) {
      return failure(
        "rate_limited",
        "Terlalu banyak pencarian lokasi. Coba lagi beberapa menit lagi.",
      );
    }
    if (error instanceof LocationSearchConcurrencyError) {
      return failure(
        "busy",
        "Pencarian lokasi lain masih berjalan. Tunggu lalu coba lagi.",
      );
    }
    if (
      error instanceof MengantarConfigurationError
      || error instanceof MengantarLocationError
    ) {
      return failure(
        "unavailable",
        "Lokasi Mengantar belum dapat dimuat. Coba lagi.",
      );
    }
    return failure("unavailable", "Pencarian lokasi belum dapat diproses.");
  }
}

export async function searchMengantarDestinationAreas(
  outletId: string,
  query: string,
): Promise<MengantarDestinationAreaSearchState> {
  const result = await searchMengantarDestinationAreasInternal(outletId, query, "provider_search");
  const publicState: MengantarDestinationAreaSearchState = {
    options: result.options,
    success: result.success,
  };
  if (result.error) publicState.error = result.error;
  if (result.message) publicState.message = result.message;
  return publicState;
}

export async function validateMengantarDestinationAreaSelection(
  outletId: string,
  query: string,
  areaId: string,
  areaLabel: string,
): Promise<MengantarDestinationAreaValidationState> {
  const result = await searchMengantarDestinationAreasInternal(outletId, query, "provider_validate");
  if (!result.success) {
    return { error: result.error, message: result.message, success: false };
  }
  const option = result.options.find((candidate) => (
    candidate.areaId === areaId && candidate.areaLabel === areaLabel
  ));
  if (!option) {
    return {
      error: "selection_mismatch",
      message: "Pilihan area berubah atau tidak cocok. Cari dan pilih ulang area tujuan.",
      success: false,
    };
  }
  if (!result.authority) {
    return failure(
      "stale_authority",
      "Koneksi Mengantar berubah. Cari ulang lokasi tujuan.",
    );
  }
  return { authority: result.authority, option, success: true };
}

export type WilayahAreaSearchState = {
  error?: "invalid_query" | "rate_limited" | "unavailable";
  message?: string;
  suggestions: WilayahSuggestion[];
  success: boolean;
};

/**
 * T-245 (D-32): suggestions while typing, from the local Kemendagri reference — kecamatan,
 * kelurahan/desa, kota/kabupaten or kode pos. No provider call and no durable rate-limit write;
 * a suggestion is never a destination until `resolveWilayahDestinationArea` finds its provider
 * option and the save re-validates that option.
 */
export async function searchWilayahDestinationAreas(query: string): Promise<WilayahAreaSearchState> {
  const started = performance.now();
  const principal = await requireTenantPrincipal();
  const tokens = wilayahQueryTokens(query);
  let state: WilayahAreaSearchState;
  if (!tokens) {
    state = { error: "invalid_query", message: "Ketik minimal 3 huruf atau angka kode pos.", suggestions: [], success: false };
  } else if (!allowWilayahSearch(principal)) {
    state = { error: "rate_limited", message: "Terlalu banyak pencarian. Tunggu sebentar lalu coba lagi.", suggestions: [], success: false };
  } else {
    try {
      state = { suggestions: await searchWilayahAreas(db, tokens), success: true };
    } catch {
      state = { error: "unavailable", message: "Daftar wilayah belum dapat dimuat. Coba lagi.", suggestions: [], success: false };
    }
  }
  emitLocationSearchTiming({
    actorId: principal.userId,
    operation: "wilayah_search",
    outcome: state.success ? (state.suggestions.length > 0 ? "success" : "empty") : state.error ?? "unavailable",
    providerCalls: 0,
    queryLength: typeof query === "string" ? query.length : 0,
    resultCount: state.suggestions.length,
    tenantId: principal.tenantId,
    totalMs: performance.now() - started,
  });
  return state;
}

export type WilayahResolveState =
  | { query: string; option: MengantarDestinationAreaOption; status: "matched" }
  | { options: MengantarDestinationAreaOption[]; query: string; status: "choose" }
  | { message: string; status: "not_found" }
  | { error: NonNullable<MengantarDestinationAreaSearchState["error"]>; message: string; status: "error" };

/**
 * T-245 (D-32): one guarded provider lookup for a picked suggestion. The wilayah row is read here
 * (client-sent names are never trusted); at most three keywords go through the same provider path
 * as a typed search (rate limit, per-actor lock, authority recheck). Exactly one strict match is
 * returned as `matched`; several (or only kecamatan-level matches) as `choose`; nothing as
 * `not_found`, where the picker falls back to searching Mengantar directly. The returned `query`
 * is the keyword that produced the options, so the save re-runs exactly that search.
 */
export async function resolveWilayahDestinationArea(
  outletId: string,
  code: string,
): Promise<WilayahResolveState> {
  const started = performance.now();
  const principal = await requireTenantPrincipal();
  let providerMs: number | undefined;
  let providerCalls = 0;
  let state: WilayahResolveState | null = null;

  let area: Awaited<ReturnType<typeof findWilayahArea>> = null;
  try {
    area = typeof code === "string" ? await findWilayahArea(db, code) : null;
  } catch {
    area = null;
  }
  if (!area) {
    state = { error: "invalid_query", message: "Area tidak dikenal. Cari ulang area tujuan.", status: "error" };
  } else {
    for (const keyword of wilayahResolveKeywords(area)) {
      const timing: { providerMs?: number } = {};
      const result = await runProviderAreaSearch(principal, outletId, keyword, timing);
      if (timing.providerMs !== undefined) {
        providerCalls += 1;
        providerMs = (providerMs ?? 0) + timing.providerMs;
      }
      if (!result.success) {
        state = {
          error: result.error ?? "unavailable",
          message: result.message ?? "Lokasi Mengantar belum dapat dimuat. Coba lagi.",
          status: "error",
        };
        break;
      }
      const match = matchProviderOptions(area, result.options);
      if (match.kind === "single") {
        state = { option: match.option, query: keyword, status: "matched" };
        break;
      }
      if (match.kind === "several") {
        state = { options: match.options, query: keyword, status: "choose" };
        break;
      }
    }
  }
  state ??= { message: "Area ini belum ditemukan di Mengantar. Cari langsung di Mengantar.", status: "not_found" };

  emitLocationSearchTiming({
    actorId: principal.userId,
    operation: "provider_resolve",
    outcome: state.status === "matched"
      ? "success"
      : state.status === "choose"
        ? "ambiguous"
        : state.status === "not_found" ? "empty" : state.error,
    providerCalls,
    providerMs,
    queryLength: typeof code === "string" ? code.length : 0,
    resultCount: state.status === "matched" ? 1 : state.status === "choose" ? state.options.length : 0,
    tenantId: principal.tenantId,
    totalMs: performance.now() - started,
  });
  return state;
}

