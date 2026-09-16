/**
 * T-153: record what the provider's own order records actually contain.
 *
 * Read-only by default. `GET /order` is the only call it makes, and it writes a
 * *shape*, not data: every key name is kept, every value is replaced by its type
 * unless it is a non-identifying enum, boolean or number the contract depends on
 * (status, courier, service, paid flags, money scales). Recipient names, phones
 * and addresses belong to the owner's real customers and never reach the file,
 * nor does the credential-bearing URL.
 *
 * Run through `secrets-env`, never with the key on a command line:
 *   secrets-env run -- node scripts/capture-mengantar-order-contract.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

for (const name of ["MENGANTAR_API_KEY", "MENGANTAR_BASE_URL"]) {
  if (!process.env[name]) throw new Error(`${name} is required.`);
}

const outputPath = resolve(
  process.env.MENGANTAR_ORDER_CONTRACT_PATH ?? "tests/fixtures/mengantar-order-contract.shape.json",
);
const base = new URL(process.env.MENGANTAR_BASE_URL);
const endpoint = new URL(
  `/api/public/${encodeURIComponent(process.env.MENGANTAR_API_KEY)}/order`,
  base.origin,
);
// The list takes `page`/`size` (and an optional JSON `dateRange`), not `limit`
// — `src/lib/mengantar-settlement.ts` is the working caller; a wrong parameter
// name silently returns one default page and reads as "the account has 50".
endpoint.searchParams.set("page", "1");
endpoint.searchParams.set("size", process.env.MENGANTAR_ORDER_CONTRACT_SIZE ?? "50");
if (process.env.MENGANTAR_ORDER_CONTRACT_DAYS) {
  const days = Number(process.env.MENGANTAR_ORDER_CONTRACT_DAYS);
  endpoint.searchParams.set("dateRange", JSON.stringify({
    startDate: new Date(Date.now() - days * 86_400_000).toISOString(),
    endDate: new Date().toISOString(),
  }));
}

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 20_000);
let response;
try {
  response = await fetch(endpoint, { headers: { Accept: "application/json" }, signal: controller.signal });
} finally {
  clearTimeout(timeout);
}
const text = await response.text();
let body;
try {
  body = JSON.parse(text);
} catch {
  throw new Error(`Mengantar /order returned non-JSON HTTP ${response.status}.`);
}

// Keys whose *value* is safe to keep: they carry no identity and the contract is
// exactly about what they contain.
const KEEP_VALUE = /^(?:success|count|total|page|limit|status|courier|service|type|kind|isPaid|isDeleted|is[A-Z]\w*|paid|deleted|currency)$/;
// Money and weight scales matter (rupiah vs sen, gram vs kilogram) but the exact
// amount is a customer's order value, so only the digit count is recorded.
const SCALE_KEY = /(?:amount|price|fee|value|cost|weight|insurance|discount|total)/i;
const IDENTIFYING = /(?:addr|address|name|phone|email|note|remark|instruction|landmark|user|token|key|url|link|_id$|^id$|ORDER_ID|CNOTE|AWB|resi)/i;

function shapeOf(value, key = "") {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    return value.length === 0 ? [] : [shapeOf(value[0], `${key}[]`)];
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([name, child]) => [name, shapeOf(child, name)]),
    );
  }
  if (KEEP_VALUE.test(key)) return value;
  if (typeof value === "number") {
    return SCALE_KEY.test(key)
      ? `number(${Math.trunc(Math.abs(value)).toString().length} digits${Number.isInteger(value) ? "" : ", fractional"})`
      : "number";
  }
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (IDENTIFYING.test(key)) return `string(${value.length} chars)`;
    // A short non-identifying string is usually an enum the contract needs.
    return value.length <= 24 ? value : `string(${value.length} chars)`;
  }
  return typeof value;
}

// Union of the keys across every returned record, so a field only some orders
// carry (exactly the case for an optional request field) is still visible.
const records = Array.isArray(body?.data) ? body.data : [];
const unionKeys = [...new Set(records.flatMap((record) => Object.keys(record ?? {})))].sort();
const presence = Object.fromEntries(
  unionKeys.map((key) => [
    key,
    {
      present: records.filter((record) => record?.[key] !== undefined).length,
      nonEmpty: records.filter((record) => record?.[key] !== undefined && record[key] !== null && record[key] !== "").length,
      shape: shapeOf(records.find((record) => record?.[key] !== undefined && record[key] !== null && record[key] !== "")?.[key] ?? null, key),
    },
  ]),
);

// T-169 needs the provider's own delivery vocabulary, not a guess at it. These
// fields are enums with no identity in them, so the distinct values are the
// contract; pages are walked until `total` is exhausted or the cap is reached.
const ENUM_FIELDS = ["status", "pod_code", "lastUndeliveredCode", "courier", "TYPE", "claimStatus", "ticketStatus"];
const distinct = Object.fromEntries(ENUM_FIELDS.map((field) => [field, new Map()]));
let scanned = 0;
const pageLimit = Number(process.env.MENGANTAR_ORDER_CONTRACT_PAGES ?? "6");
for (let page = 1; page <= pageLimit; page += 1) {
  const pageUrl = new URL(endpoint);
  pageUrl.searchParams.set("page", String(page));
  pageUrl.searchParams.set("size", "100");
  const pageController = new AbortController();
  const pageTimeout = setTimeout(() => pageController.abort(), 20_000);
  let pageBody;
  try {
    const pageResponse = await fetch(pageUrl, { headers: { Accept: "application/json" }, signal: pageController.signal });
    pageBody = JSON.parse(await pageResponse.text());
  } catch {
    break;
  } finally {
    clearTimeout(pageTimeout);
  }
  const pageRecords = Array.isArray(pageBody?.data) ? pageBody.data : [];
  if (pageRecords.length === 0) break;
  scanned += pageRecords.length;
  for (const record of pageRecords) {
    for (const field of ENUM_FIELDS) {
      const value = record?.[field];
      if (value === undefined || value === null || value === "") continue;
      distinct[field].set(String(value), (distinct[field].get(String(value)) ?? 0) + 1);
    }
  }
  if (typeof pageBody?.total === "number" && scanned >= pageBody.total) break;
}
const vocabulary = Object.fromEntries(
  ENUM_FIELDS.map((field) => [
    field,
    Object.fromEntries([...distinct[field].entries()].sort((a, b) => b[1] - a[1])),
  ]),
);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  `${JSON.stringify({
    contract: "GET /api/public/{key}/order — stored order record shape. Key names kept, values reduced to type/scale/enum. No customer data, no credential.",
    capturedAt: new Date().toISOString().slice(0, 10),
    httpStatus: response.status,
    host: base.hostname,
    envelope: { success: body?.success, count: body?.count, total: body?.total },
    recordsInspected: records.length,
    vocabularyScanned: scanned,
    /** T-169: the provider's own delivery vocabulary, counted, not guessed. */
    vocabulary,
    fields: presence,
  }, null, 2)}\n`,
);
console.log(JSON.stringify({ httpStatus: response.status, recordsInspected: records.length, fields: unionKeys.length, vocabularyScanned: scanned, outputPath }));
