import "server-only";

import type { MengantarCredentials } from "@/lib/mengantar-credentials";

const MAX_RESPONSE_BYTES = 512_000;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_IDENTIFIER_LENGTH = 160;
const MAX_LABEL_LENGTH = 320;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;

export type MengantarPickupOption = {
  originAreaId: string;
  originLabel: string;
  pickupAddressId: string;
  pickupLabel: string;
};

export class MengantarLocationError extends Error {
  constructor() {
    super("Mengantar location data is unavailable.");
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
    const pickupAddress = requiredText(address.PICKUP_ADDRESS, MAX_LABEL_LENGTH);
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

export async function fetchMengantarPickupOptions(
  credentials: Pick<MengantarCredentials, "apiKey" | "baseUrl" | "pickupAddressId">,
  source: "platform_default" | "private",
): Promise<MengantarPickupOption[]> {
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
    || !credentials.apiKey.trim()
  ) {
    throw new MengantarLocationError();
  }

  const endpoint = new URL(
    `${baseUrl.toString().replace(/\/$/, "")}/api/public/${encodeURIComponent(credentials.apiKey)}/address`,
  );
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

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new MengantarLocationError();
  }
  const options = normalizeMengantarPickupOptions(payload);
  if (source === "private") return options;

  const configured = options.filter(
    (option) => option.pickupAddressId === credentials.pickupAddressId,
  );
  if (configured.length !== 1) throw new MengantarLocationError();
  return configured;
}
