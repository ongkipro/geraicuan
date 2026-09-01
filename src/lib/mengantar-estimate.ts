import "server-only";

import type { SupportedEstimateService } from "@/db/estimate-repository";
import type { MengantarCredentials } from "@/lib/mengantar-credentials";

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
  currency?: unknown;
  estimate_delivery?: unknown;
  estimatedDate?: unknown;
  price?: unknown;
  unsupported?: unknown;
  unsupported_cod?: unknown;
};

export class MengantarEstimateError extends Error {
  constructor() {
    super("Mengantar estimate is unavailable.");
  }
}

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

    services.push({
      codEligible: service.unsupported_cod === false,
      currency: "IDR",
      deliveryEstimate,
      insuranceAmountIdr: null,
      insuranceSourceField: null,
      providerService,
      shippingAmountIdr: price,
      shippingSourceField: "price",
    });
  }

  if (services.length === 0) throw new MengantarEstimateError();
  return services;
}

export async function fetchMengantarEstimate(
  credentials: MengantarCredentials,
  request: DraftEstimateRequest,
): Promise<SupportedEstimateService[]> {
  const baseUrl = new URL(credentials.baseUrl);
  if (baseUrl.protocol !== "https:" || baseUrl.username || baseUrl.password) {
    throw new MengantarEstimateError();
  }

  const endpoint = new URL(`${baseUrl.toString().replace(/\/$/, "")}/api/public/${credentials.apiKey}/order/estimate`);
  endpoint.searchParams.set("origin_id", request.originAreaId);
  endpoint.searchParams.set("destination_id", request.destinationAreaId);
  endpoint.searchParams.set("courier", "all");
  endpoint.searchParams.set("weight", String(request.weightGrams / 1_000));

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
