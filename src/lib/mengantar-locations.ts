import "server-only";

import type { MengantarCredentials } from "@/lib/mengantar-credentials";

const MAX_RESPONSE_BYTES = 512_000;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_IDENTIFIER_LENGTH = 160;
const MAX_LABEL_LENGTH = 320;
const MAX_AREA_LABEL_LENGTH = 160;
const MAX_AREA_RESULTS = 100;
const MIN_AREA_QUERY_LENGTH = 3;
const MAX_AREA_QUERY_LENGTH = 100;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u;

export type MengantarPickupOption = {
  originAreaId: string;
  originLabel: string;
  pickupAddressId: string;
  pickupLabel: string;
};

export type MengantarDestinationAreaOption = {
  areaId: string;
  areaLabel: string;
};

export class MengantarLocationError extends Error {
  constructor() {
    super("Mengantar location data is unavailable.");
  }
}

export class MengantarLocationQueryError extends Error {
  constructor() {
    super("Mengantar location query is invalid.");
  }
}

function requiredText(value: unknown, maxLength: number) {
  if (typeof value !== "string") throw new MengantarLocationError();
  const normalized = value.trim();
  if (
    normalized.length === 0
    || normalized.length > maxLength
    || CONTROL_CHARACTER_PATTERN.test(normalized)
  ) {
    throw new MengantarLocationError();
  }
  return normalized;
}

function optionalText(value: unknown, maxLength: number) {
  if (value === undefined || value === null || value === "") return null;
  return requiredText(value, maxLength);
}

function joinLabel(parts: Array<string | null>) {
  const label = parts.filter((part): part is string => Boolean(part)).join(", ");
  if (label.length === 0 || label.length > MAX_LABEL_LENGTH) {
    throw new MengantarLocationError();
  }
  return label;
}

function joinAreaLabel(parts: string[]) {
  const label = parts.join(", ");
  if (label.length === 0 || label.length > MAX_AREA_LABEL_LENGTH) {
    throw new MengantarLocationError();
  }
  return label;
}

export function normalizeMengantarAreaQuery(value: unknown) {
  if (typeof value !== "string") throw new MengantarLocationQueryError();
  const unicodeNormalized = value.normalize("NFKC");
  if (CONTROL_CHARACTER_PATTERN.test(unicodeNormalized)) {
    throw new MengantarLocationQueryError();
  }
  const normalized = unicodeNormalized.replace(/\s+/gu, " ").trim();
  if (
    normalized.length < MIN_AREA_QUERY_LENGTH
    || normalized.length > MAX_AREA_QUERY_LENGTH
  ) {
    throw new MengantarLocationQueryError();
  }
  return normalized;
}

export function normalizeMengantarDestinationAreaOptions(
  payload: unknown,
): MengantarDestinationAreaOption[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new MengantarLocationError();
  }
  const response = payload as { data?: unknown; success?: unknown };
  if (
    response.success !== true
    || !Array.isArray(response.data)
    || response.data.length > MAX_AREA_RESULTS
  ) {
    throw new MengantarLocationError();
  }

  const unique = new Map<string, MengantarDestinationAreaOption>();
  for (const item of response.data) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new MengantarLocationError();
    }
    const area = item as Record<string, unknown>;
    const option = {
      areaId: requiredText(area._id, MAX_IDENTIFIER_LENGTH),
      areaLabel: joinAreaLabel([
        requiredText(area.SUBDISTRICT_NAME, MAX_AREA_LABEL_LENGTH),
        requiredText(area.DISTRICT_NAME, MAX_AREA_LABEL_LENGTH),
        requiredText(area.CITY_NAME, MAX_AREA_LABEL_LENGTH),
        requiredText(area.PROVINCE_NAME, MAX_AREA_LABEL_LENGTH),
        requiredText(area.ZIP_CODE, 12),
      ]),
    };
    const existing = unique.get(option.areaId);
    if (existing && existing.areaLabel !== option.areaLabel) {
      throw new MengantarLocationError();
    }
    unique.set(option.areaId, option);
  }

  return [...unique.values()].sort((left, right) =>
    left.areaLabel.localeCompare(right.areaLabel, "id-ID")
    || left.areaId.localeCompare(right.areaId));
}

export function normalizeMengantarPickupOptions(payload: unknown): MengantarPickupOption[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new MengantarLocationError();
  }
  const response = payload as { data?: unknown; success?: unknown };
  if (response.success !== true || !Array.isArray(response.data)) {
    throw new MengantarLocationError();
  }

  const options = response.data.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new MengantarLocationError();
    }
    const address = item as Record<string, unknown>;
    const pickupAddressId = requiredText(address._id, MAX_IDENTIFIER_LENGTH);
    const originAreaId = requiredText(address.PICKUP_AUTOFILL, MAX_IDENTIFIER_LENGTH);
    const pickupName = requiredText(address.PICKUP_NAME, MAX_LABEL_LENGTH);
    // Provider street addresses may be multiline; display them on one line.
    // All other controls, identifiers and label limits retain strict validation.
    const pickupAddress = requiredText(
      typeof address.PICKUP_ADDRESS === "string"
        ? address.PICKUP_ADDRESS.replace(/\r\n?|\n/g, " ")
        : address.PICKUP_ADDRESS,
      MAX_LABEL_LENGTH,
    );
    const district = requiredText(address.PICKUP_DISTRICT, MAX_LABEL_LENGTH);
    const city = requiredText(address.PICKUP_CITY, MAX_LABEL_LENGTH);
    const province = requiredText(address.PICKUP_REGION, MAX_LABEL_LENGTH);
    const subdistrict = optionalText(address.PICKUP_SUBDISTRICT, MAX_LABEL_LENGTH);
    const zip = optionalText(address.PICKUP_ZIP, 12);

    return {
      originAreaId,
      originLabel: joinLabel([district, city, province]),
      pickupAddressId,
      pickupLabel: joinLabel([
        pickupName,
        pickupAddress,
        subdistrict,
        district,
        city,
        province,
        zip,
      ]),
    };
  });

  const unique = new Map<string, MengantarPickupOption>();
  for (const option of options) {
    if (unique.has(option.pickupAddressId)) throw new MengantarLocationError();
    unique.set(option.pickupAddressId, option);
  }
  return [...unique.values()].sort((left, right) =>
    left.pickupLabel.localeCompare(right.pickupLabel, "id-ID")
    || left.pickupAddressId.localeCompare(right.pickupAddressId));
}

async function readBoundedBody(response: Response, controller: AbortController) {
  const reader = response.body?.getReader();
  if (!reader) throw new MengantarLocationError();
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
        throw new MengantarLocationError();
      }
      parts.push(decoder.decode(value, { stream: true }));
    }
    parts.push(decoder.decode());
    return parts.join("");
  } finally {
    reader.releaseLock();
  }
}

function mengantarEndpoint(
  credentials: Pick<MengantarCredentials, "apiKey" | "baseUrl">,
  path: string,
) {
  let baseUrl: URL;
  try {
    baseUrl = new URL(credentials.baseUrl);
  } catch {
    throw new MengantarLocationError();
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
    throw new MengantarLocationError();
  }
  return new URL(
    `/api/public/${encodeURIComponent(credentials.apiKey)}/${path}`,
    baseUrl.origin,
  );
}

async function fetchMengantarJson(endpoint: URL) {
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
      throw new MengantarLocationError();
    }
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
      controller.abort();
      throw new MengantarLocationError();
    }
    text = await readBoundedBody(response, controller);
  } catch {
    throw new MengantarLocationError();
  } finally {
    clearTimeout(timeout);
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new MengantarLocationError();
  }
}

export async function fetchMengantarPickupOptions(
  credentials: Pick<MengantarCredentials, "apiKey" | "baseUrl" | "pickupAddressId">,
  source: "platform_default" | "private",
): Promise<MengantarPickupOption[]> {
  const endpoint = mengantarEndpoint(credentials, "address");
  const payload = await fetchMengantarJson(endpoint);
  const options = normalizeMengantarPickupOptions(payload);
  if (source === "private") return options;

  const configured = options.filter(
    (option) => option.pickupAddressId === credentials.pickupAddressId,
  );
  if (configured.length !== 1) throw new MengantarLocationError();
  return configured;
}

export async function fetchMengantarDestinationAreas(
  credentials: Pick<MengantarCredentials, "apiKey" | "baseUrl">,
  query: string,
): Promise<MengantarDestinationAreaOption[]> {
  const normalizedQuery = normalizeMengantarAreaQuery(query);
  const endpoint = mengantarEndpoint(credentials, "address/search");
  endpoint.searchParams.set("keyword", normalizedQuery);
  return normalizeMengantarDestinationAreaOptions(
    await fetchMengantarJson(endpoint),
  );
}
