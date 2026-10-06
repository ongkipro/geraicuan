import "server-only";

import type { MengantarAccountCredentials } from "@/lib/mengantar-credentials";

/**
 * T-280 (D-42): the one HTTP client for Mengantar's mutating Public API calls
 * (`POST /order`, `POST /time`, `POST /order/pay-unpaid`, `DELETE /order`,
 * `GET /order?order_id=`). The credential sits in the URL path
 * (`{BASE_URL}/api/public/{API_KEY}/…`, api-public.mengantar.com/docs), so the
 * URL is built here, used once and never returned, logged or put in an error.
 */
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RESPONSE_BYTES = 1_000_000;

/** Nothing reached Mengantar, or no answer could be read: the outcome is unknown. */
export class MengantarHttpTransportError extends Error {
  constructor() {
    super("Mengantar request failed before a readable answer.");
  }
}

export type MengantarHttpAnswer = {
  status: number;
  /** Parsed JSON body, or `undefined` when the body was empty or not JSON. */
  body: unknown;
};

function apiOrigin(baseUrl: string) {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new MengantarHttpTransportError();
  }
  if (
    url.protocol !== "https:"
    || !url.hostname
    || url.username
    || url.password
    || url.pathname !== "/"
    || url.search
    || url.hash
  ) {
    throw new MengantarHttpTransportError();
  }
  return url.origin;
}

async function readBounded(response: Response, controller: AbortController) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const parts: string[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_RESPONSE_BYTES) {
        controller.abort();
        throw new MengantarHttpTransportError();
      }
      parts.push(decoder.decode(value, { stream: true }));
    }
    parts.push(decoder.decode());
    return parts.join("");
  } finally {
    reader.releaseLock();
  }
}

/**
 * One request; never retried here (retries are the caller's decision, and an
 * order submission is never retried before reconciliation). Any status is
 * returned with its parsed body; only a network failure, timeout, redirect or
 * unreadable body throws.
 */
/** Throws unless the credentials can address the API (bare https origin, a key): checked before any send. */
export function assertMengantarCredentialsUsable(credentials: Pick<MengantarAccountCredentials, "apiKey" | "baseUrl">) {
  if (!credentials.apiKey.trim()) throw new MengantarHttpTransportError();
  apiOrigin(credentials.baseUrl);
}

export async function requestMengantar(
  credentials: Pick<MengantarAccountCredentials, "apiKey" | "baseUrl">,
  method: "GET" | "POST" | "DELETE",
  path: string,
  options: { body?: unknown; query?: Record<string, string> } = {},
): Promise<MengantarHttpAnswer> {
  if (!credentials.apiKey.trim() || !path.startsWith("/")) throw new MengantarHttpTransportError();
  const endpoint = new URL(
    `/api/public/${encodeURIComponent(credentials.apiKey)}${path}`,
    apiOrigin(credentials.baseUrl),
  );
  for (const [key, value] of Object.entries(options.query ?? {})) endpoint.searchParams.set(key, value);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      method,
      redirect: "error",
      signal: controller.signal,
    });
    const text = await readBounded(response, controller);
    let body: unknown;
    try {
      body = text.trim() ? JSON.parse(text) : undefined;
    } catch {
      body = undefined;
    }
    return { body, status: response.status };
  } catch {
    // The error may carry the request URL; it is dropped here on purpose.
    throw new MengantarHttpTransportError();
  } finally {
    clearTimeout(timeout);
  }
}

/** A short, credential-free provider message for the operator, or null. */
export function mengantarAnswerMessage(body: unknown, secret?: string): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  const raw = [record.message, record.error, record.msg].find((value) => typeof value === "string");
  if (typeof raw !== "string") return null;
  const text = raw.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim();
  if (!text || /api\/public\//i.test(text)) return null;
  if (secret?.trim() && [secret, encodeURIComponent(secret)].some((form) => raw.includes(form) || text.includes(form))) return null;
  return text.slice(0, 200);
}
