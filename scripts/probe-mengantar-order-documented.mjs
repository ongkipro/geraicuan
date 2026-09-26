/**
 * T-237 / D-26: the ONE owner-approved live proof of the documented order body.
 *
 * Sends exactly one non-COD `dropOff` order in the shape the public docs
 * (api-public.mengantar.com/docs, "Create Order", read 2026-09-26) document and
 * `src/lib/mengantar-order.ts` `buildMengantarOrderRequest` now builds:
 *
 *   POST {BASE_URL}/api/public/{API_KEY}/order
 *   {courier, pickup: {type: "dropOff", address_id},
 *    orders: [{customerName, customerPhone, customerAddress, customerAddressDataId,
 *              parcelContent, weight, quantity, goodsValue, isDangerousGoods}]}
 *
 * It CREATES A REAL ORDER, so it refuses to run unless BOTH are present:
 *   - the command-line flag `--i-have-owner-approval`, and
 *   - the environment variable `MENGANTAR_LIVE_PROBE=1`.
 * The refusal happens before any credential is read or any request is made.
 * No other Mengantar endpoint is called (no estimate, time, pay or search).
 *
 * Run through `secrets-env`, never with the key on a command line:
 *   MENGANTAR_LIVE_PROBE=1 MENGANTAR_DESTINATION_AREA_ID=<area _id from /address/search> \
 *   secrets-env run -- node scripts/probe-mengantar-order-documented.mjs --i-have-owner-approval
 *
 * Output: a sanitized request/response on stdout and in
 * tests/fixtures/mengantar-order-documented.live.json. T-247 (review L7): sanitizing is an
 * ALLOW-LIST (`scripts/mengantar-probe-sanitize.mjs`): every key name is kept, but only
 * structural values and the test order's own identifiers are kept verbatim; names,
 * addresses, phones, free text and account identifiers become shapes, so no personal data
 * can reach tests/fixtures. Cancel the created order in the Mengantar app afterwards (the
 * parcel content says so).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { sanitizeProbeCapture } from "./mengantar-probe-sanitize.mjs";

if (!process.argv.includes("--i-have-owner-approval") || process.env.MENGANTAR_LIVE_PROBE !== "1") {
  console.error(
    "Refusing: this creates ONE real Mengantar order. It needs the flag --i-have-owner-approval "
    + "and MENGANTAR_LIVE_PROBE=1, and the owner's explicit approval at run time (D-26). Nothing was sent.",
  );
  process.exit(2);
}

for (const name of ["MENGANTAR_API_KEY", "MENGANTAR_BASE_URL", "MENGANTAR_PICKUP_ADDRESS_ID", "MENGANTAR_DESTINATION_AREA_ID"]) {
  if (!process.env[name]) {
    console.error(`${name} is required. Nothing was sent.`);
    process.exit(2);
  }
}

const base = new URL(process.env.MENGANTAR_BASE_URL);
if (base.protocol !== "https:") {
  console.error("MENGANTAR_BASE_URL must be https. Nothing was sent.");
  process.exit(2);
}
const apiKey = process.env.MENGANTAR_API_KEY;
const pickupAddressId = process.env.MENGANTAR_PICKUP_ADDRESS_ID;
const destinationAreaId = process.env.MENGANTAR_DESTINATION_AREA_ID;
// A documented `courier` value: "JNE", "SiCepat", "Sap", "iDexpress", "JT", "lion", "anteraja", "pos".
const courier = process.env.MENGANTAR_PROBE_COURIER ?? "JNE";
const DOCUMENTED_COURIERS = ["JNE", "SiCepat", "Sap", "iDexpress", "JT", "lion", "anteraja", "pos"];
if (!DOCUMENTED_COURIERS.includes(courier)) {
  console.error(`MENGANTAR_PROBE_COURIER must be one of ${DOCUMENTED_COURIERS.join(", ")}. Nothing was sent.`);
  process.exit(2);
}

const outputPath = resolve("tests/fixtures/mengantar-order-documented.live.json");
const endpoint = new URL(`/api/public/${encodeURIComponent(apiKey)}/order`, base.origin);
const stamp = Date.now().toString(36).toUpperCase().slice(-6);
const TEST_PHONE = "081200000001";

const body = {
  courier,
  pickup: { type: "dropOff", address_id: pickupAddressId },
  orders: [{
    customerName: "UJI COBA SISTEM - MOHON DIBATALKAN",
    customerPhone: TEST_PHONE,
    customerAddress: "Uji kontrak API GeraiCUAN - bukan kiriman nyata, mohon dibatalkan",
    customerAddressDataId: destinationAreaId,
    parcelContent: `UJI KONTRAK ${stamp} - BATALKAN`,
    // Documented unit: kg. 1000 g → 1.
    weight: 1,
    quantity: 1,
    // Non-COD: `goodsValue` is required and `COD` is not sent.
    goodsValue: 10_000,
    isDangerousGoods: false,
  }],
};

function sanitize(value) {
  return sanitizeProbeCapture(value, [
    [apiKey, "[API_KEY]"],
    [encodeURIComponent(apiKey), "[API_KEY]"],
    [pickupAddressId, "[PICKUP_ADDRESS_ID]"],
    [destinationAreaId, "[AREA_ID]"],
    [TEST_PHONE, "[PHONE]"],
  ]);
}

function batchIdLocation(response) {
  const first = Array.isArray(response?.data) ? response.data[0] : undefined;
  const inItem = first && typeof first === "object" && first.batch_id !== undefined && first.batch_id !== null;
  const inEnvelope = response && typeof response === "object" && response.batch_id !== undefined && response.batch_id !== null;
  return inItem ? (inEnvelope ? "both" : "item") : inEnvelope ? "envelope" : "none";
}

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 30_000);
let status = 0;
let responseBody = null;
try {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
    redirect: "error",
    signal: controller.signal,
  });
  status = response.status;
  const text = await response.text();
  try {
    responseBody = JSON.parse(text);
  } catch {
    responseBody = { nonJson: true, length: text.length };
  }
} catch (error) {
  responseBody = { transportError: error instanceof Error ? error.name : "unknown" };
} finally {
  clearTimeout(timeout);
}

const sanitizedResponse = sanitize(responseBody);
const item = Array.isArray(sanitizedResponse?.data) ? sanitizedResponse.data[0] : null;
const capture = {
  contract: "POST /api/public/{key}/order — documented body (D-26), one non-COD dropOff. Allow-list sanitized: key names kept; only structural values and the test order's own ids verbatim, everything else a shape.",
  capturedAt: new Date().toISOString().slice(0, 10),
  host: base.hostname,
  request: sanitize(body),
  response: { status, body: sanitizedResponse },
  observed: {
    accepted: status >= 200 && status < 300 && sanitizedResponse?.success === true,
    batchIdLocation: batchIdLocation(sanitizedResponse),
    itemKeys: item && typeof item === "object" ? Object.keys(item).sort() : null,
    envelopeKeys: sanitizedResponse && typeof sanitizedResponse === "object" ? Object.keys(sanitizedResponse).sort() : null,
    isPaid: item?.isPaid ?? null,
    hasCnote: typeof item?.cnote_no === "string" && item.cnote_no.length > 0,
  },
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(capture, null, 2)}\n`);
console.log(JSON.stringify({ ...capture, outputPath }, null, 2));
