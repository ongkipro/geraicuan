import "server-only";

import type { SupportedEstimateService } from "@/db/estimate-repository";
import type { MengantarCredentials } from "@/lib/mengantar-credentials";
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
  codFee?: unknown;
  currency?: unknown;
  discount?: unknown;
  estimate_delivery?: unknown;
  estimatedDate?: unknown;
  estimatedPrice?: unknown;
  estimatedSpecialPrice?: unknown;
  price?: unknown;
  unsupported?: unknown;
  unsupported_cod?: unknown;
};

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

function readDeliveryEstimate(service: ProviderService) {
  const value = service.estimate_delivery ?? service.estimatedDate;
  return typeof value === "string" && value.trim().length > 0 && value.length <= 160 ? value : null;
}

export function normalizeMengantarEstimateServices(data: unknown): SupportedEstimateService[] {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new MengantarEstimateError();
  }

  const services: SupportedEstimateService[] = [];
  for (const [providerService, value] of Object.entries(data)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;

    const service = value as ProviderService;
    const price = service.price;
    const deliveryEstimate = readDeliveryEstimate(service);
    if (
      !PROVIDER_SERVICE_PATTERN.test(providerService) ||
      providerService.length > MAX_PROVIDER_SERVICE_LENGTH ||
      service.unsupported === true ||
      (service.currency !== undefined && service.currency !== "IDR") ||
      typeof price !== "number" ||
      !Number.isSafeInteger(price) ||
      !deliveryEstimate ||
      price < 0 ||
      price > MAX_IDR_AMOUNT
    ) {
      continue;
    }

    const normalPriceIdr = readOptionalIdr(service.estimatedPrice);
    const specialPriceIdr = readOptionalIdr(service.estimatedSpecialPrice);
    const codFeeIdr = readOptionalIdr(service.codFee);
    // `discount` is display-only: nothing downstream prices the shipment or
    // computes the seller payout from it, so a malformed value degrades to
    // null instead of dropping a courier that is otherwise priced correctly.
    const rawDiscountIdr = readOptionalIdr(service.discount);
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
      codEligible: service.unsupported_cod === false,
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
      && (value as ProviderService).unsupported === true
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
  return normalizeMengantarEstimateServices(result.data);
}
