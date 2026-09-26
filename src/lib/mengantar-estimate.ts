import "server-only";

import type { SupportedEstimateService } from "@/db/estimate-repository";
import type { MengantarCredentials } from "@/lib/mengantar-credentials";
import { isMengantarServiceOffered, mengantarCourierOfService } from "@/lib/mengantar-couriers";
import { toBillableWeightKg } from "@/lib/shipment-draft";

const MAX_RESPONSE_BYTES = 512_000;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_IDR_AMOUNT = 2_147_483_647;
const MAX_PROVIDER_SERVICE_LENGTH = 80;
const PROVIDER_SERVICE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,79}$/;

type DraftEstimateRequest = {
  originAreaId: string;
  destinationAreaId: string;
  weightGrams: number;
};

type ProviderService = {
  cargoDiscount?: unknown;
  cargoEstimatedPrice?: unknown;
  cargoEstimatedSpecialPrice?: unknown;
  cargoPrice?: unknown;
  codFee?: unknown;
  currency?: unknown;
  discount?: unknown;
  estimate_delivery?: unknown;
  estimate_delivery_cargo?: unknown;
  estimatedDate?: unknown;
  estimatedPrice?: unknown;
  estimatedSpecialPrice?: unknown;
  coverage_cod?: unknown;
  minimumWeightCargo?: unknown;
  price?: unknown;
  unsupported?: unknown;
  unsupportedPickup?: unknown;
  unsupported_cod?: unknown;
  unsupportedCodCheckFirstSap?: unknown;
};

/**
 * DATA-13: a service Mengantar cannot collect from this origin or pick up at
 * is hidden. `unsupportedOriginSicepat`/`unsupportedOriginNinja`/
 * `unsupportedPickup` are captured (as `false`) in the sandbox estimate; any
 * other `unsupportedOrigin*` spelling is covered by the prefix.
 */
function isOriginOrPickupUnsupported(service: ProviderService) {
  return service.unsupportedPickup === true
    || Object.entries(service).some(([key, value]) => key.startsWith("unsupportedOrigin") && value === true);
}

/**
 * DATA-13: the captures omit `unsupported_cod` on JNE, JNECargo, SiCepat,
 * SiCepatCargo and Ninja, which still accept COD. COD is refused only on an
 * explicit `unsupported_cod: true` or `coverage_cod: false`, and (D-30) on
 * `unsupportedCodCheckFirstSap: true` — a per-service key the sandbox capture
 * carries (as `false`) on SAP, SAPLite and SapCargo.
 */
function isCodEligible(service: ProviderService) {
  return service.unsupported_cod !== true
    && service.coverage_cod !== false
    && service.unsupportedCodCheckFirstSap !== true;
}

const MALFORMED_AMOUNT = Symbol("malformed provider amount");

/**
 * An amount the provider may omit. Absent stays `null`; present but not a whole
 * non-negative rupiah integer in range is malformed, and the caller drops the
 * whole service rather than persisting a guessed number.
 */
function readOptionalIdr(value: unknown): number | null | typeof MALFORMED_AMOUNT {
  if (value === undefined || value === null) return null;
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && value <= MAX_IDR_AMOUNT
    ? value
    : MALFORMED_AMOUNT;
}

export class MengantarEstimateError extends Error {
  constructor() {
    super("Mengantar estimate is unavailable.");
  }
}

export class MengantarNoSupportedServicesError extends MengantarEstimateError {}

async function readBoundedResponseBody(response: Response, controller: AbortController) {
  const reader = response.body?.getReader();
  if (!reader) throw new MengantarEstimateError();

  const decoder = new TextDecoder("utf-8", { fatal: true });
  const parts: string[] = [];
  let receivedBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      receivedBytes += value.byteLength;
      if (receivedBytes > MAX_RESPONSE_BYTES) {
        controller.abort();
        throw new MengantarEstimateError();
      }
      parts.push(decoder.decode(value, { stream: true }));
    }
    parts.push(decoder.decode());
    return parts.join("");
  } finally {
    reader.releaseLock();
  }
}

function readDeliveryEstimate(service: ProviderService, cargo: boolean) {
  const value = (cargo ? service.estimate_delivery_cargo : undefined) ?? service.estimate_delivery ?? service.estimatedDate;
  return typeof value === "string" && value.trim().length > 0 && value.length <= 160 ? value : null;
}

/**
 * A courier's cargo service key (`JNECargo`, `SiCepatCargo`, `SapCargo`,
 * `iDexpressCargo`). The docs name the couriers "that have cargo option: (JNE,
 * SiCepat, Sap, iDexpress)" (Create Order, `orders.cargo`).
 */
export function isMengantarCargoService(providerService: string) {
  const courier = mengantarCourierOfService(providerService);
  return courier !== null
    && providerService.replace(/[^A-Za-z0-9]/g, "").toLowerCase() === `${courier.toLowerCase()}cargo`;
}

/**
 * T-237: a cargo key quotes its own tier. In the sandbox capture every cargo key's
 * `price` equals its `cargoPrice`, but its `estimatedPrice`/`estimatedSpecialPrice`
 * can be the regular service's (SiCepatCargo: 6 000 / 4 200 against a 30 000
 * cargo price). The docs describe `cargoEstimatedPrice` as "Cargo total before
 * discount" and `cargoEstimatedSpecialPrice` as "Cargo discounted total" (Check
 * Shipping Fee Public), so a cargo key's normal/special price and discount come
 * from the `cargo*` fields; 0 there means "no cargo figure", never a free quote.
 */
function cargoAware(service: ProviderService, cargo: boolean) {
  if (!cargo) {
    return {
      discount: service.discount,
      normal: service.estimatedPrice,
      price: service.price,
      special: service.estimatedSpecialPrice,
    };
  }
  const positiveOrNull = (value: unknown) => (value === 0 ? null : value);
  return {
    discount: service.cargoDiscount,
    normal: positiveOrNull(service.cargoEstimatedPrice),
    price: service.cargoPrice ?? service.price,
    special: positiveOrNull(service.cargoEstimatedSpecialPrice),
  };
}

/**
 * "minimumWeightCargo is shown only for couriers that support cargo shipments"
 * (docs, Check Shipping Fee 3PL; captured as `5` on SapCargo). A cargo service
 * whose minimum the parcel does not reach is hidden; an unreadable minimum hides
 * it too. Without a known weight nothing is hidden here.
 */
function belowCargoMinimum(service: ProviderService, weightGrams: number | undefined) {
  if (service.minimumWeightCargo === undefined || service.minimumWeightCargo === null) return false;
  const minimumKg = typeof service.minimumWeightCargo === "string"
    ? Number(service.minimumWeightCargo)
    : service.minimumWeightCargo;
  if (typeof minimumKg !== "number" || !Number.isFinite(minimumKg) || minimumKg < 0) return true;
  return weightGrams !== undefined && weightGrams < minimumKg * 1000;
}

export function normalizeMengantarEstimateServices(
  data: unknown,
  request: { weightGrams?: number } = {},
): SupportedEstimateService[] {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new MengantarEstimateError();
  }

  const services: SupportedEstimateService[] = [];
  for (const [providerService, value] of Object.entries(data)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;

    const service = value as ProviderService;
    const cargo = isMengantarCargoService(providerService);
    const quote = cargoAware(service, cargo);
    const price = quote.price;
    const deliveryEstimate = readDeliveryEstimate(service, cargo);
    if (
      !PROVIDER_SERVICE_PATTERN.test(providerService) ||
      providerService.length > MAX_PROVIDER_SERVICE_LENGTH ||
      service.unsupported === true ||
      isOriginOrPickupUnsupported(service) ||
      // D-29: a discontinued courier (Ninja) is never offered, whatever it quotes.
      !isMengantarServiceOffered(providerService) ||
      (cargo && belowCargoMinimum(service, request.weightGrams)) ||
      (service.currency !== undefined && service.currency !== "IDR") ||
      typeof price !== "number" ||
      !Number.isSafeInteger(price) ||
      !deliveryEstimate ||
      price < 0 ||
      price > MAX_IDR_AMOUNT
    ) {
      continue;
    }

    const normalPriceIdr = readOptionalIdr(quote.normal);
    const specialPriceIdr = readOptionalIdr(quote.special);
    const codFeeIdr = readOptionalIdr(service.codFee);
    // `discount` is display-only: nothing downstream prices the shipment or
    // computes the seller payout from it, so a malformed value degrades to
    // null instead of dropping a courier that is otherwise priced correctly.
    const rawDiscountIdr = readOptionalIdr(quote.discount);
    const discountIdr = rawDiscountIdr === MALFORMED_AMOUNT ? null : rawDiscountIdr;
    if (
      normalPriceIdr === MALFORMED_AMOUNT
      || specialPriceIdr === MALFORMED_AMOUNT
      || codFeeIdr === MALFORMED_AMOUNT
      // A special price above the normal price is not a discount; it means the
      // two keys do not mean what we think, so the service fails closed.
      || (normalPriceIdr !== null && specialPriceIdr !== null && specialPriceIdr > normalPriceIdr)
    ) {
      continue;
    }

    services.push({
      codEligible: isCodEligible(service),
      codFeeIdr,
      currency: "IDR",
      deliveryEstimate,
      discountIdr,
      insuranceAmountIdr: null,
      insuranceSourceField: null,
      normalPriceIdr,
      providerService,
      shippingAmountIdr: price,
      shippingSourceField: "price",
      specialPriceIdr,
    });
  }

  if (services.length === 0) {
    const entries = Object.entries(data);
    const allUnsupported = entries.length > 0 && entries.every(([name, value]) => (
      PROVIDER_SERVICE_PATTERN.test(name)
      && value && typeof value === "object" && !Array.isArray(value)
      && ((value as ProviderService).unsupported === true
        || isOriginOrPickupUnsupported(value as ProviderService)
        || !isMengantarServiceOffered(name)
        || (isMengantarCargoService(name) && belowCargoMinimum(value as ProviderService, request.weightGrams)))
    ));
    if (allUnsupported) throw new MengantarNoSupportedServicesError();
    throw new MengantarEstimateError();
  }
  return services;
}

export async function fetchMengantarEstimate(
  credentials: MengantarCredentials,
  request: DraftEstimateRequest,
): Promise<SupportedEstimateService[]> {
  let baseUrl: URL;
  try {
    baseUrl = new URL(credentials.baseUrl);
  } catch {
    throw new MengantarEstimateError();
  }
  if (
    baseUrl.protocol !== "https:"
    || !baseUrl.hostname
    || baseUrl.username
    || baseUrl.password
    || baseUrl.pathname !== "/"
    || baseUrl.search
    || baseUrl.hash
    || !credentials.apiKey.trim()
  ) {
    throw new MengantarEstimateError();
  }

  const endpoint = new URL(
    `/api/public/${encodeURIComponent(credentials.apiKey)}/order/estimate`,
    baseUrl.origin,
  );
  endpoint.searchParams.set("origin_id", request.originAreaId);
  endpoint.searchParams.set("destination_id", request.destinationAreaId);
  endpoint.searchParams.set("courier", "all");
  // One weight rule for the estimate and the order: a quote priced at a weight
  // the order does not repeat is not a quote for that order.
  let billableWeightKg: number;
  try {
    billableWeightKg = toBillableWeightKg(request.weightGrams);
  } catch {
    throw new MengantarEstimateError();
  }
  endpoint.searchParams.set("weight", String(billableWeightKg));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let text: string;
  try {
    const response = await fetch(endpoint, {
      headers: { Accept: "application/json" },
      redirect: "error",
      signal: controller.signal,
    });

    if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) {
      throw new MengantarEstimateError();
    }

    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
      controller.abort();
      throw new MengantarEstimateError();
    }

    text = await readBoundedResponseBody(response, controller);
  } catch {
    throw new MengantarEstimateError();
  } finally {
    clearTimeout(timeout);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new MengantarEstimateError();
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new MengantarEstimateError();
  }
  const result = payload as { data?: unknown; success?: unknown };
  if (result.success !== true) throw new MengantarEstimateError();
  return normalizeMengantarEstimateServices(result.data, { weightGrams: request.weightGrams });
}
