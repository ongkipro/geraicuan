import "server-only";

import type { MengantarAccountCredentials } from "@/lib/mengantar-credentials";

// Read-only settlement contract. Shapes and identities are pinned by
// tests/fixtures/mengantar-*.sanitized.json from the 2026-09-15 capture: a
// reconciliation invoice's amount equals the sum of its per-AWB subItems, and
// each subItem pays COD_AMOUNT − estimatedSpecialPrice.
//
// T-178: those amounts are not whole rupiah. The price Mengantar deducts is the
// discounted shipping plus its COD fee, `COD_AMOUNT × 0.0333` unrounded, so
// `amount` and `estimatedSpecialPrice` carry the fee's fraction (1,016 of 2,866
// real COD subItems, 202 of 600 real invoices —
// tests/fixtures/mengantar-cod-identities.json). 333 basis points of a whole
// rupiah is exact at four decimal places, so money is read as ten-thousandths
// of a rupiah in BigInt and never as floating point.
const MAX_RESPONSE_BYTES = 2_000_000;
const REQUEST_TIMEOUT_MS = 20_000;
const PAGE_SIZE = 50;
// lazy: 40 pages × 50 per invoice type and for orders; a busier account needs a shorter period or cursor persistence.
const MAX_PAGES = 40;
const MAX_IDR = 1_000_000_000_000;
/** Ten-thousandths of a rupiah per rupiah: the precision of a 333-bp fee on a whole-rupiah COD amount. */
export const IDR_UNITS = BigInt(10_000);
/**
 * Exclusive bound for a provider amount (Rp 10 miliar). Below it a value with
 * five decimals still fits in the 15 significant digits a double always
 * carries, so a fifth decimal is seen and refused rather than rounded away.
 * lazy: one invoice line or total of Rp 10 miliar or more fails the pull closed; raise it only with a decimal JSON parser.
 */
const MAX_DECIMAL_IDR = 10_000_000_000;
const DECIMAL_IDR_TEXT = /^(-?)(\d+)(?:\.(\d{1,4}))?$/;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;
const SAFE_STATUS = /^[A-Za-z][A-Za-z0-9 /_-]{0,59}$/;

export type ProviderSettlementItemType = "SETTLEMENT" | "CHARGE" | "REFUND";

export type ProviderInvoiceReference = {
  providerInvoiceId: string;
  invoiceNumber: string;
  invoiceStatus: string;
  invoiceCreatedAt: Date;
};

export type ProviderSettlementItem = ProviderInvoiceReference & {
  itemType: Exclude<ProviderSettlementItemType, "REFUND">;
  cnoteNo: string;
  /** Exact decimal text with four places (`IDR_UNITS`); fractional on real invoices. */
  amountIdr: string;
  codAmountIdr: number | null;
  /** Provider fee, 3.33% of COD unrounded; exact decimal text with four places. */
  codFeeIdr: string | null;
  /** The invoice's `estimatedSpecialPrice`: discounted shipping plus the COD fee; exact decimal text. */
  shippingAmountIdr: string | null;
};

export type ProviderRefundInvoice = ProviderInvoiceReference & {
  amountIdr: string;
  /** AWB-shaped tokens from the description; used only in memory for exact matching. */
  referenceTokens: string[];
};

export type ProviderOrderStatus = {
  cnoteNo: string;
  status: string;
  /** DATA-13 `lastHistory` / `pod_code`; optional so older callers need not name them. */
  lastHistoryDesc?: string | null;
  lastHistoryAt?: Date | null;
  podCode?: string | null;
};

export type ProviderSettlementSnapshot = {
  invoiceCount: number;
  orderCount: number;
  items: ProviderSettlementItem[];
  refunds: ProviderRefundInvoice[];
  orderStatuses: ProviderOrderStatus[];
};

export class MengantarSettlementError extends Error {
  constructor() {
    super("Mengantar settlement data is unavailable.");
  }
}

export class MengantarSettlementTooLargeError extends MengantarSettlementError {}

const API_INVOICE_TYPES = {
  SETTLEMENT: "typeReconciliation",
  CHARGE: "typePayment",
  REFUND: "typeRefund",
} as const satisfies Record<ProviderSettlementItemType, string>;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new MengantarSettlementError();
  return value as Record<string, unknown>;
}

function identifier(value: unknown) {
  if (typeof value !== "string" || !SAFE_IDENTIFIER.test(value.trim())) throw new MengantarSettlementError();
  return value.trim();
}

function wholeIdr(value: unknown) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > MAX_IDR) {
    throw new MengantarSettlementError();
  }
  return value;
}

function optionalWholeIdr(value: unknown) {
  return value === undefined || value === null ? null : wholeIdr(value);
}

/** Exact rupiah text (as PostgreSQL `numeric` returns it) to ten-thousandths; null when it is not one. */
export function parseIdrUnits(text: string): bigint | null {
  const match = DECIMAL_IDR_TEXT.exec(text);
  if (!match) return null;
  const units = BigInt(match[2]) * IDR_UNITS + BigInt((match[3] ?? "").padEnd(4, "0"));
  return match[1] === "-" ? -units : units;
}

export function formatIdrUnits(units: bigint) {
  const negative = units < BigInt(0);
  const magnitude = negative ? -units : units;
  const fraction = String(magnitude % IDR_UNITS).padStart(4, "0");
  return `${negative ? "-" : ""}${magnitude / IDR_UNITS}.${fraction}`;
}

/**
 * Floating-point noise a provider amount can carry, in ten-thousandths of a
 * rupiah, and still be the four-decimal value it was meant to be.
 *
 * Binary noise scales with the numbers the provider computed *from*, not with
 * the result: `10007 − (9000 + 10007 × 0.0333)` is `673.7669000000005`. An
 * earlier version read every value at 15 significant digits of the result,
 * which kept that noise on a small result and refused it — and one refused
 * line aborts the whole pull, the defect this parser exists to fix. Measured
 * (T-178 review): across 772,301 small COD lines computed that way the noise
 * never exceeds 0.0000003 units, and just below `MAX_DECIMAL_IDR` it stays
 * under 0.016. A genuine fifth decimal is at least 0.1 units off a whole unit,
 * so 0.05 separates the two with room on both sides.
 */
const NOISE_TOLERANCE_UNITS = 0.05;

/**
 * A provider amount to exact ten-thousandths of a rupiah. Anything within
 * `NOISE_TOLERANCE_UNITS` of a whole unit is that unit; anything further is a
 * precision no Mengantar fee on a whole-rupiah amount produces, and — like a
 * value outside the range or not a finite number — refuses the whole page.
 * `value × 10000` stays below 1e14 inside the range, where every integer is
 * exact in a double.
 */
function decimalIdrUnits(value: unknown, allowNegative = false) {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) >= MAX_DECIMAL_IDR) {
    throw new MengantarSettlementError();
  }
  if (!allowNegative && value < 0) throw new MengantarSettlementError();
  const scaled = value * Number(IDR_UNITS);
  const units = Math.round(scaled);
  if (Math.abs(scaled - units) > NOISE_TOLERANCE_UNITS) throw new MengantarSettlementError();
  return BigInt(units);
}

function optionalDecimalIdr(value: unknown) {
  return value === undefined || value === null ? null : formatIdrUnits(decimalIdrUnits(value));
}

function status(value: unknown) {
  if (typeof value !== "string" || !SAFE_STATUS.test(value.trim())) throw new MengantarSettlementError();
  return value.trim();
}

function invoiceReference(invoice: Record<string, unknown>): ProviderInvoiceReference {
  const createdAt = typeof invoice.createdAt === "string" ? new Date(invoice.createdAt) : null;
  if (!createdAt || Number.isNaN(createdAt.getTime())) throw new MengantarSettlementError();
  return {
    providerInvoiceId: identifier(invoice._id),
    invoiceNumber: identifier(invoice.inv_number),
    invoiceStatus: status(invoice.status),
    invoiceCreatedAt: createdAt,
  };
}

function referenceTokens(description: unknown) {
  if (typeof description !== "string") return [];
  // Case is preserved: stored cnote_no values are matched exactly.
  return [...new Set(description.split(/[^A-Za-z0-9._-]+/).filter((token) => (
    token.length >= 8 && /\d/.test(token) && SAFE_IDENTIFIER.test(token)
  )))];
}

export function normalizeMengantarInvoicePage(payload: unknown, itemType: ProviderSettlementItemType) {
  const body = record(payload);
  if (body.success !== true || !Array.isArray(body.data)) throw new MengantarSettlementError();
  const count = pageCount(body.count);

  const items: ProviderSettlementItem[] = [];
  const refunds: ProviderRefundInvoice[] = [];
  for (const raw of body.data) {
    const invoice = record(raw);
    if (invoice.type !== API_INVOICE_TYPES[itemType]) throw new MengantarSettlementError();
    const reference = invoiceReference(invoice);
    const amountUnits = decimalIdrUnits(invoice.amount, true);

    if (itemType === "REFUND") {
      refunds.push({ ...reference, amountIdr: formatIdrUnits(amountUnits), referenceTokens: referenceTokens(invoice.description) });
      continue;
    }

    const subItems = invoice.subItems === undefined ? [] : invoice.subItems;
    if (!Array.isArray(subItems)) throw new MengantarSettlementError();
    let subTotalUnits = BigInt(0);
    for (const rawSub of subItems) {
      // Only whitelisted fields are read; receiver, goods and pickup PII never leave this loop.
      const sub = record(rawSub);
      const units = decimalIdrUnits(sub.amount, true);
      subTotalUnits += units;
      if (sub.cnote_no === undefined || sub.cnote_no === null || sub.cnote_no === "") continue;
      items.push({
        ...reference,
        itemType,
        cnoteNo: identifier(sub.cnote_no),
        amountIdr: formatIdrUnits(units),
        codAmountIdr: optionalWholeIdr(sub.COD_AMOUNT),
        codFeeIdr: optionalDecimalIdr(sub.COD_FEE),
        shippingAmountIdr: optionalDecimalIdr(sub.estimatedSpecialPrice),
      });
    }
    // A reconciliation invoice that does not add up — to the ten-thousandth — is not authoritative evidence.
    if (itemType === "SETTLEMENT" && subTotalUnits !== amountUnits) throw new MengantarSettlementError();
  }
  return { count, items, refunds, pageLength: body.data.length };
}

function pageCount(value: unknown) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new MengantarSettlementError();
  return value;
}

const WIB_TIMESTAMP = /^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2})(?::(\d{2}))?$/;
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const MAX_HISTORY_DESC_LENGTH = 500;
const SAFE_POD_CODE = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,31}$/;

/**
 * Mengantar `lastHistory.date`, "DD-MM-YYYY HH:mm" in Asia/Jakarta (UTC+7, no
 * DST). Anything else, including an impossible calendar date, is null — this
 * is evidence, and a guessed time is worse than none.
 */
export function parseMengantarWibTimestamp(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const match = WIB_TIMESTAMP.exec(value.trim());
  if (!match) return null;
  const [day, month, year, hour, minute] = match.slice(1, 6).map(Number) as [number, number, number, number, number];
  const second = Number(match[6] ?? 0);
  const utc = Date.UTC(year, month - 1, day, hour, minute, second);
  const calendar = new Date(utc);
  if (
    calendar.getUTCFullYear() !== year
    || calendar.getUTCMonth() !== month - 1
    || calendar.getUTCDate() !== day
    || calendar.getUTCHours() !== hour
    || calendar.getUTCMinutes() !== minute
    || calendar.getUTCSeconds() !== second
  ) {
    return null;
  }
  return new Date(utc - WIB_OFFSET_MS);
}

function optionalHistoryDesc(value: unknown) {
  if (typeof value !== "string") return null;
  const text = value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, MAX_HISTORY_DESC_LENGTH) : null;
}

function optionalPodCode(value: unknown) {
  const text = typeof value === "number" && Number.isSafeInteger(value) ? String(value)
    : typeof value === "string" ? value.trim() : "";
  return SAFE_POD_CODE.test(text) ? text : null;
}

/** Never throws: a missing or malformed `lastHistory`/`pod_code` must not fail the pull. */
function orderHistoryEvidence(order: Record<string, unknown>) {
  const history = order.lastHistory && typeof order.lastHistory === "object" && !Array.isArray(order.lastHistory)
    ? order.lastHistory as Record<string, unknown>
    : {};
  return {
    lastHistoryDesc: optionalHistoryDesc(history.desc),
    lastHistoryAt: parseMengantarWibTimestamp(history.date),
    podCode: optionalPodCode(order.pod_code),
  };
}

export function normalizeMengantarOrderPage(payload: unknown) {
  const body = record(payload);
  if (body.success !== true || !Array.isArray(body.data)) throw new MengantarSettlementError();
  const count = pageCount(body.count);
  const orders: ProviderOrderStatus[] = [];
  for (const raw of body.data) {
    const order = record(raw);
    if (order.isDeleted === true) continue;
    if (typeof order.cnote_no !== "string" || !order.cnote_no.trim()) continue;
    orders.push({
      cnoteNo: identifier(order.cnote_no),
      status: status(order.status),
      ...orderHistoryEvidence(order),
    });
  }
  return { count, orders, pageLength: body.data.length };
}

async function readBoundedJson(response: Response, controller: AbortController) {
  const reader = response.body?.getReader();
  if (!reader) throw new MengantarSettlementError();
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
        throw new MengantarSettlementError();
      }
      parts.push(decoder.decode(value, { stream: true }));
    }
    parts.push(decoder.decode());
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(parts.join("")) as unknown;
}

function endpointFor(credentials: MengantarAccountCredentials, path: "/invoices" | "/order") {
  let baseUrl: URL;
  try {
    baseUrl = new URL(credentials.baseUrl);
  } catch {
    throw new MengantarSettlementError();
  }
  if (
    baseUrl.protocol !== "https:" || !baseUrl.hostname || baseUrl.username || baseUrl.password
    || baseUrl.pathname !== "/" || baseUrl.search || baseUrl.hash || !credentials.apiKey.trim()
  ) {
    throw new MengantarSettlementError();
  }
  return new URL(`/api/public/${encodeURIComponent(credentials.apiKey)}${path}`, baseUrl.origin);
}

async function getPage(credentials: MengantarAccountCredentials, path: "/invoices" | "/order", params: Record<string, string>) {
  const endpoint = endpointFor(credentials, path);
  for (const [key, value] of Object.entries(params)) endpoint.searchParams.set(key, value);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      headers: { Accept: "application/json" },
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) {
      await response.body?.cancel().catch(() => undefined);
      throw new MengantarSettlementError();
    }
    return await readBoundedJson(response, controller);
  } catch {
    // Never rethrow the fetch error: its message can carry the credential-bearing URL.
    throw new MengantarSettlementError();
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchMengantarSettlement(
  credentials: MengantarAccountCredentials,
  period: { start: Date; end: Date },
): Promise<ProviderSettlementSnapshot> {
  if (!(period.start < period.end)) throw new MengantarSettlementError();
  const dateRange = JSON.stringify({
    startDate: period.start.toISOString(),
    endDate: new Date(period.end.getTime() - 1).toISOString(),
  });
  const snapshot: ProviderSettlementSnapshot = { invoiceCount: 0, orderCount: 0, items: [], refunds: [], orderStatuses: [] };

  for (const itemType of ["SETTLEMENT", "CHARGE", "REFUND"] as const) {
    let seen = 0;
    for (let page = 1; ; page += 1) {
      if (page > MAX_PAGES) throw new MengantarSettlementTooLargeError();
      const result = normalizeMengantarInvoicePage(await getPage(credentials, "/invoices", {
        page: String(page), size: String(PAGE_SIZE), invoiceFilter: API_INVOICE_TYPES[itemType], dateRange,
      }), itemType);
      snapshot.items.push(...result.items);
      snapshot.refunds.push(...result.refunds);
      seen += result.pageLength;
      if (seen >= result.count) break;
      // A short page before `count` means the provider capped or dropped records; never report partial data as complete.
      if (result.pageLength < PAGE_SIZE) throw new MengantarSettlementError();
    }
    snapshot.invoiceCount += seen;
  }

  let ordersSeen = 0;
  for (let page = 1; ; page += 1) {
    if (page > MAX_PAGES) throw new MengantarSettlementTooLargeError();
    const result = normalizeMengantarOrderPage(await getPage(credentials, "/order", {
      page: String(page), size: String(PAGE_SIZE), dateRange,
    }));
    snapshot.orderStatuses.push(...result.orders);
    ordersSeen += result.pageLength;
    if (ordersSeen >= result.count) break;
    if (result.pageLength < PAGE_SIZE) throw new MengantarSettlementError();
  }
  snapshot.orderCount = ordersSeen;
  return snapshot;
}
