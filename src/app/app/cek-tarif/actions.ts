"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { validateMengantarDestinationAreaSelection } from "@/app/app/location-actions";
import { db } from "@/db/client";
import { requireReadyShipmentOutlet } from "@/db/outlet-readiness-repository";
import { outlets } from "@/db/schema";
import { TenantContextDeniedError, withTenantContext } from "@/db/tenant-context";
import { loadTenantDisabledCouriers } from "@/db/tenant-settings-repository";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { enforceEstimateRateLimit, EstimateRateLimitedError } from "@/lib/estimate-rate-limit";
import { characterClassError } from "@/lib/field-character-classes";
import { filterTenantCourierServices } from "@/lib/gerai-settings";
import {
  lockMengantarAccountAuthority,
  MengantarConfigurationError,
  resolveMengantarAccountCredentials,
  sameMengantarAccountAuthority,
} from "@/lib/mengantar-credentials";
import {
  fetchMengantarEstimate,
  MengantarEstimateError,
  MengantarNoSupportedServicesError,
} from "@/lib/mengantar-estimate";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;

export type ShippingRateActionState = {
  error?: string;
  fieldErrors?: Partial<Record<"outletId" | "destinationAreaLabel" | "weightGrams", string>>;
  quote?: {
    outletId: string;
    originAreaLabel: string;
    destinationAreaLabel: string;
    weightGrams: number;
    retrievedAt: string;
    services: {
      providerService: string;
      shippingAmountIdr: number;
      deliveryEstimate: string;
      codEligible: boolean;
    }[];
  };
};

class RateCheckUnavailableError extends Error {}

function validText(value: FormDataEntryValue | null, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0
    && value.length <= maxLength && !CONTROL_CHARACTER_PATTERN.test(value);
}

export async function checkShippingRates(
  _previous: ShippingRateActionState,
  formData: FormData,
): Promise<ShippingRateActionState> {
  let principal;
  try {
    principal = await requireCmsScope("tenant");
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) redirect("/login/tenant");
    throw error;
  }
  if (principal.scope !== "tenant") redirect("/login/tenant");

  const outletId = formData.get("outletId");
  const areaOutletId = formData.get("areaOutletId");
  const areaId = formData.get("areaId");
  const areaLabel = formData.get("areaLabel");
  const areaQuery = formData.get("areaQuery");
  const weight = formData.get("weightGrams");
  const fieldErrors: NonNullable<ShippingRateActionState["fieldErrors"]> = {};
  if (typeof outletId !== "string" || !UUID_PATTERN.test(outletId)) {
    fieldErrors.outletId = "Pilih outlet asal yang siap digunakan.";
  }
  if (
    areaOutletId !== outletId || !validText(areaId, 160)
    || !validText(areaLabel, 320) || !validText(areaQuery, 100)
  ) {
    fieldErrors.destinationAreaLabel = "Cari dan pilih area tujuan untuk outlet asal.";
  }
  const weightGrams = typeof weight === "string" && /^[0-9]{1,6}$/.test(weight)
    ? Number(weight) : NaN;
  const weightClass = typeof weight === "string"
    ? characterClassError("NUMERIC_INTEGER", "Berat paket", weight)
    : null;
  if (weightClass) {
    fieldErrors.weightGrams = weightClass;
  } else if (!Number.isSafeInteger(weightGrams) || weightGrams < 1 || weightGrams > 100_000) {
    fieldErrors.weightGrams = "Masukkan berat bulat antara 1 dan 100.000 gram.";
  }
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };
  // The field checks above also narrow the values used at the provider boundary.
  if (typeof outletId !== "string" || typeof areaId !== "string"
    || typeof areaLabel !== "string" || typeof areaQuery !== "string") return { fieldErrors };

  try {
    // Commit the attempt separately so a rejected provider result cannot undo the limit.
    await withTenantContext(db, principal.userId, principal.tenantId, enforceEstimateRateLimit);
    await withTenantContext(db, principal.userId, principal.tenantId, async (tx, context) => {
      if (!await requireReadyShipmentOutlet(tx, context, outletId)) {
        throw new MengantarConfigurationError();
      }
    });
    const destination = await validateMengantarDestinationAreaSelection(
      outletId, areaQuery, areaId, areaLabel,
    );
    if (!destination.success || !destination.option || !destination.authority) {
      return { fieldErrors: {
        destinationAreaLabel: destination.message ?? "Cari dan pilih ulang area tujuan.",
      } };
    }
    const prepared = await withTenantContext(
      db, principal.userId, principal.tenantId, async (tx, context) => {
        await lockMengantarAccountAuthority(tx, context, outletId);
        if (!await requireReadyShipmentOutlet(tx, context, outletId)) {
          throw new MengantarConfigurationError();
        }
        const resolved = await resolveMengantarAccountCredentials(tx, context, outletId);
        if (!sameMengantarAccountAuthority(destination.authority!, resolved.authority)
          || !resolved.originAreaId || !resolved.pickupAddressId) {
          throw new RateCheckUnavailableError();
        }
        const [outlet] = await tx.select({
          originAreaId: outlets.defaultOriginAreaId,
          originAreaLabel: outlets.defaultOriginAreaLabel,
        }).from(outlets).where(and(
          eq(outlets.tenantId, context.tenantId), eq(outlets.id, outletId),
        )).limit(1);
        if (!outlet) throw new MengantarConfigurationError();
        const originAreaLabel = outlet.originAreaId === resolved.originAreaId && outlet.originAreaLabel
          ? outlet.originAreaLabel
          : resolved.source === "platform_default" ? "Asal koneksi platform" : "Asal outlet";
        // T-243: Mitra kurir — the gerai's switched-off couriers are not quoted back.
        const disabledCouriers = await loadTenantDisabledCouriers(tx, context);
        return { disabledCouriers, resolved, originAreaLabel };
      },
    );

    let services: Awaited<ReturnType<typeof fetchMengantarEstimate>>;
    try {
      services = await fetchMengantarEstimate({
        ...prepared.resolved.credentials,
        originAreaId: prepared.resolved.originAreaId,
        pickupAddressId: prepared.resolved.pickupAddressId,
      }, {
        originAreaId: prepared.resolved.originAreaId,
        destinationAreaId: destination.option.areaId,
        weightGrams,
      });
    } catch (error) {
      if (!(error instanceof MengantarNoSupportedServicesError)) throw error;
      services = [];
    }

    await withTenantContext(db, principal.userId, principal.tenantId, async (tx, context) => {
      await lockMengantarAccountAuthority(tx, context, outletId);
      if (!await requireReadyShipmentOutlet(tx, context, outletId)) {
        throw new MengantarConfigurationError();
      }
      const current = await resolveMengantarAccountCredentials(tx, context, outletId);
      if (!sameMengantarAccountAuthority(prepared.resolved.authority, current.authority)
        || prepared.resolved.originAreaId !== current.originAreaId
        || prepared.resolved.pickupAddressId !== current.pickupAddressId) {
        throw new RateCheckUnavailableError();
      }
    });
    return { quote: {
      outletId,
      originAreaLabel: prepared.originAreaLabel,
      destinationAreaLabel: destination.option.areaLabel,
      weightGrams,
      retrievedAt: new Date().toISOString(),
      services: filterTenantCourierServices(services, prepared.disabledCouriers).map(({ providerService, shippingAmountIdr, deliveryEstimate, codEligible }) => ({
        providerService, shippingAmountIdr, deliveryEstimate, codEligible,
      })),
    } };
  } catch (error) {
    if (error instanceof EstimateRateLimitedError) {
      return { error: "Terlalu banyak permintaan tarif. Coba lagi beberapa menit lagi." };
    }
    if (error instanceof MengantarConfigurationError) {
      return { error: "Outlet atau koneksi Mengantar belum siap. Periksa pengaturan outlet." };
    }
    if (error instanceof RateCheckUnavailableError) {
      return { error: "Koneksi atau asal outlet berubah. Cari ulang tujuan lalu cek tarif kembali." };
    }
    if (error instanceof TenantContextDeniedError || error instanceof CmsAuthorizationDeniedError) {
      return { error: "Akses outlet tidak tersedia. Muat ulang halaman." };
    }
    if (error instanceof MengantarEstimateError) {
      return { error: "Tarif belum dapat dimuat dari Mengantar. Coba lagi." };
    }
    throw error;
  }
}
