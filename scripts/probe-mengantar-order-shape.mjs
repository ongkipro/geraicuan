/**
 * T-153: find the `POST /order` body the provider actually accepts.
 *
 * GeraiCUAN's own payload (lower_snake, bare array) is refused with HTTP 400
 * "Undefined error" even stripped to its base fields, so the contract we ship is
 * not the contract the provider has. This walks a small matrix of candidate
 * shapes, one request each, and **stops at the first acceptance** — every
 * refusal creates nothing, and the owner authorized exactly one created order.
 *
 * Non-COD throughout: no COD principal, no customer money. A non-COD order draws
 * on the wallet, and an empty wallet yields an unpaid draft with no AWB, which
 * still answers the contract question.
 *
 * Run through `secrets-env`, never with the key on a command line:
 *   MENGANTAR_CREATE_ORDER=yes-create-one-real-order \
 *   secrets-env run -- node scripts/probe-mengantar-order-shape.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

for (const name of ["MENGANTAR_API_KEY", "MENGANTAR_BASE_URL", "MENGANTAR_ORIGIN_AREA_ID", "MENGANTAR_PICKUP_ADDRESS_ID"]) {
  if (!process.env[name]) throw new Error(`${name} is required.`);
}
if (process.env.MENGANTAR_CREATE_ORDER !== "yes-create-one-real-order") {
  throw new Error("Refusing to probe order creation without the explicit confirmation value.");
}

const base = new URL(process.env.MENGANTAR_BASE_URL);
const apiKey = process.env.MENGANTAR_API_KEY;
const originId = process.env.MENGANTAR_ORIGIN_AREA_ID;
const pickupAddressId = process.env.MENGANTAR_PICKUP_ADDRESS_ID;
const outputPath = resolve("tests/fixtures/mengantar-order-shape.probe.json");
const endpoint = (path) => new URL(`/api/public/${encodeURIComponent(apiKey)}${path}`, base.origin);

// A real, *different* destination: the first probe shipped an area to itself,
// which no courier serves. `address/search` returns the provider's own areas.
const searchUrl = endpoint("/address/search");
searchUrl.searchParams.set("keyword", process.env.MENGANTAR_DESTINATION_KEYWORD ?? "Kelapa Gading");
const areaResponse = await fetch(searchUrl, { headers: { Accept: "application/json" } });
const areaBody = await areaResponse.json();
const areas = (Array.isArray(areaBody?.data) ? areaBody.data : Array.isArray(areaBody) ? areaBody : [])
  .filter((area) => area?._id && area._id !== originId);
if (areas.length === 0) throw new Error("No destination area resolved; nothing was created.");
const destination = areas[0];
const resolvedDestinationId = destination._id;

// Which couriers actually serve this route, and at what service key.
const estimateUrl = endpoint("/order/estimate");
estimateUrl.searchParams.set("origin_id", originId);
estimateUrl.searchParams.set("destination_id", resolvedDestinationId);
estimateUrl.searchParams.set("courier", "all");
estimateUrl.searchParams.set("weight", "1");
const estimateBody = await (await fetch(estimateUrl, { headers: { Accept: "application/json" } })).json();
const supported = Object.entries(estimateBody?.data ?? {})
  .filter(([, value]) => value && typeof value === "object" && value.unsupported !== true)
  .map(([providerService]) => providerService);
if (supported.length === 0) throw new Error("No courier serves this route; nothing was created.");

const stamp = Date.now().toString(36).toUpperCase().slice(-6);
const TEST_NAME = "UJI COBA SISTEM - MOHON DIBATALKAN";
const TEST_ADDRESS = "Uji coba kontrak API GeraiCUAN - bukan kiriman nyata, mohon dibatalkan";
const TEST_PHONE = "081200000001";
const ITEM = `UJI KONTRAK ${stamp} - BATALKAN`;

const lowerSnake = {
  pickup_address_id: pickupAddressId,
  sender_name: "GeraiCUAN Uji Kontrak",
  sender_phone: "081200000000",
  sender_address: "Uji kontrak API GeraiCUAN",
  receiver_name: TEST_NAME,
  receiver_phone: TEST_PHONE,
  receiver_address: TEST_ADDRESS,
  destination_id: resolvedDestinationId,
  courier: supported[0].replace(/(?<=[a-z])[A-Z].*$/, ""),
  service: supported[0],
  weight: 1,
  quantity: 1,
  item_name: ITEM,
  goods_value: 10000,
  is_cod: false,
  cod_amount: 0,
};

const upperSnake = {
  PICKUP_ADDRESS_ID: pickupAddressId,
  SHIPPER_NAME: "GeraiCUAN Uji Kontrak",
  SHIPPER_CONTACT: "GeraiCUAN",
  SHIPPER_PHONE: "081200000000",
  RECEIVER_NAME: TEST_NAME,
  RECEIVER_PHONE: TEST_PHONE,
  RECEIVER_ADDR1: TEST_ADDRESS,
  DESTINATION_ID: resolvedDestinationId,
  GOODS_DESC: ITEM,
  GOODS_AMOUNT: 10000,
  COD_AMOUNT: 0,
  WEIGHT: 1,
  TYPE: "PICKUP",
  courier: "JNE",
  service: "JNE",
};

const VARIANTS = [
  ...supported.slice(0, 4).map((providerService) => ({
    id: `service-${providerService}`,
    body: [{ ...lowerSnake, courier: providerService.replace(/(?<=[a-z])[A-Z].*$/, ""), service: providerService }],
  })),
  { id: "A-lower-array", body: [lowerSnake] },
  { id: "B-lower-object", body: lowerSnake },
  { id: "C-lower-orders-array", body: { orders: [lowerSnake] } },
  { id: "D-lower-data-array", body: { data: [lowerSnake] } },
  { id: "E-upper-array", body: [upperSnake] },
  { id: "F-upper-object", body: upperSnake },
  { id: "G-lower-array-woo", body: [lowerSnake], headers: { "x-client-source": "woocommerce" } },
  { id: "H-lower-array-pickup-date", body: [{ ...lowerSnake, type: "PICKUP", pickup_date: new Date(Date.now() + 150 * 60_000).toISOString().slice(0, 10) }] },
  { id: "I-lower-array-int-weight-grams", body: [{ ...lowerSnake, weight: 1000 }] },
  { id: "J-lower-array-no-service", body: [Object.fromEntries(Object.entries(lowerSnake).filter(([key]) => key !== "service"))] },
];

const results = [];
let accepted = null;
for (const variant of VARIANTS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  let status = 0;
  let body = null;
  try {
    const response = await fetch(endpoint("/order"), {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", ...variant.headers },
      body: JSON.stringify(variant.body),
      signal: controller.signal,
    });
    status = response.status;
    const text = await response.text();
    try {
      body = JSON.parse(text);
    } catch {
      body = { nonJson: true, length: text.length };
    }
  } catch (error) {
    body = { transportError: error instanceof Error ? error.name : "unknown" };
  } finally {
    clearTimeout(timeout);
  }
  const redacted = JSON.parse(
    JSON.stringify(body ?? null)
      .replaceAll(TEST_PHONE, "[PHONE]")
      .replaceAll("081200000000", "[PHONE]")
      .replaceAll(pickupAddressId, "[PICKUP_ID]")
      .replaceAll(resolvedDestinationId, "[AREA_ID]")
      .replaceAll(originId, "[AREA_ID]"),
  );
  const ok = status >= 200 && status < 300 && redacted?.success !== false;
  results.push({ id: variant.id, status, success: redacted?.success ?? null, message: typeof redacted?.message === "string" ? redacted.message.slice(0, 200) : null, keys: redacted && typeof redacted === "object" ? Object.keys(redacted) : null });
  if (ok) {
    accepted = { id: variant.id, status, body: redacted, sentKeys: Object.keys(Array.isArray(variant.body) ? variant.body[0] : (variant.body.orders?.[0] ?? variant.body.data?.[0] ?? variant.body)).sort() };
    break;
  }
  // Dynamic-AWB couriers must never see parallel submissions; serialize anyway.
  await new Promise((done) => setTimeout(done, 1_500));
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify({
  contract: "POST /api/public/{key}/order — which body shape the provider accepts. Redacted: no credential, no identifiers, no customer data.",
  capturedAt: new Date().toISOString().slice(0, 10),
  host: base.hostname,
  isCod: false,
  route: { originIsAccountDefault: true, destinationKeyword: process.env.MENGANTAR_DESTINATION_KEYWORD ?? "Kelapa Gading", destinationCity: destination.CITY_NAME, destinationDistrict: destination.DISTRICT_NAME },
  supportedServices: supported,
  attempts: results,
  accepted,
}, null, 2)}\n`);
console.log(JSON.stringify({ attempts: results.length, accepted: accepted?.id ?? null, results, outputPath }, null, 2));
