"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { db, dbPool } from "@/db/client";
import { listReadyShipmentOutlets } from "@/db/outlet-readiness-repository";
import { withTenantContext } from "@/db/tenant-context";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import {
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
import { parseUiAuditScenario, UI_AUDIT_HEADER } from "@/lib/ui-audit-scenario";

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

async function searchMengantarDestinationAreasInternal(
  outletId: string,
  query: string,
): Promise<InternalDestinationAreaSearchState> {
  const principal = await requireTenantPrincipal();
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

    const options = await withLocationSearchConcurrencyGuard(
      dbPool,
      prepared.context,
      () => fetchMengantarDestinationAreas(
        prepared.credentials,
        normalizedQuery,
      ),
    );
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
  const result = await searchMengantarDestinationAreasInternal(outletId, query);
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
  const result = await searchMengantarDestinationAreasInternal(outletId, query);
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
