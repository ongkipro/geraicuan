/**
 * T-153: prove which `POST /order` request keys the provider actually accepts.
 *
 * **This creates a real order on the owner's real account.** It runs only with
 * `MENGANTAR_CREATE_ORDER=yes-create-one-real-order`, and the owner authorized
 * exactly one on 2026-09-16 ("boleh coba create order jika diperlukan, nanti
 * bisa cancel dari Mengantar"). It is deliberately non-COD, so no COD principal
 * and no customer money are involved: a non-COD order draws on the Mengantar
 * wallet, and an empty wallet yields an unpaid draft with no AWB — which still
 * answers the contract question and costs nothing.
 *
 * The experiment: every candidate spelling for the three field-parity keys is
 * sent in one order with a distinct sentinel value, then the created order is
 * read back. A key the provider stored is a key the provider accepts; a key that
 * vanished is a key we must stop sending. One order, every answer.
 *
 * Run through `secrets-env`, never with the key on a command line:
 *   MENGANTAR_CREATE_ORDER=yes-create-one-real-order \
 *   secrets-env run -- node scripts/capture-mengantar-order-request.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

for (const name of ["MENGANTAR_API_KEY", "MENGANTAR_BASE_URL", "MENGANTAR_ORIGIN_AREA_ID", "MENGANTAR_PICKUP_ADDRESS_ID"]) {
  if (!process.env[name]) throw new Error(`${name} is required.`);
}
const CONFIRMATION = "yes-create-one-real-order";
const dryRun = process.env.MENGANTAR_CREATE_ORDER !== CONFIRMATION;

const base = new URL(process.env.MENGANTAR_BASE_URL);
const apiKey = process.env.MENGANTAR_API_KEY;
const originId = process.env.MENGANTAR_ORIGIN_AREA_ID;
const pickupAddressId = process.env.MENGANTAR_PICKUP_ADDRESS_ID;
const destinationId = process.env.MENGANTAR_DESTINATION_AREA_ID ?? originId;
const outputPath = resolve(process.env.MENGANTAR_ORDER_REQUEST_PATH ?? "tests/fixtures/mengantar-order-request.shape.json");

const endpoint = (path) => new URL(`/api/public/${encodeURIComponent(apiKey)}${path}`, base.origin);

async function call(path, init) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(endpoint(path), {
      ...init,
      headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
      signal: controller.signal,
    });
    const text = await response.text();
    try {
      return { status: response.status, body: JSON.parse(text) };
    } catch {
      // Never echo the body: an HTML error page from the edge can carry the URL.
      return { status: response.status, body: null, nonJson: true, length: text.length };
    }
  } finally {
    clearTimeout(timeout);
  }
}

// 1. A live estimate picks a courier and service that genuinely serve this route,
//    instead of hardcoding a pair that may have been retired.
const estimateUrl = endpoint("/order/estimate");
estimateUrl.searchParams.set("origin_id", originId);
estimateUrl.searchParams.set("destination_id", destinationId);
estimateUrl.searchParams.set("courier", "all");
estimateUrl.searchParams.set("weight", "1");
const estimateController = new AbortController();
const estimateTimeout = setTimeout(() => estimateController.abort(), 20_000);
let estimate;
try {
  const response = await fetch(estimateUrl, { headers: { Accept: "application/json" }, signal: estimateController.signal });
  estimate = { status: response.status, body: JSON.parse(await response.text()) };
} finally {
  clearTimeout(estimateTimeout);
}
// `data` is an object keyed by provider service ("JNE", "JNECargo", …), not an
// array — `src/lib/mengantar-estimate.ts` is the working reader.
const services = Object.entries(estimate.body?.data ?? {})
  .filter(([, value]) => value && typeof value === "object" && value.unsupported !== true)
  .map(([providerService, value]) => ({ providerService, ...value }));
// JNE issues its AWB up front, so one request needs no concurrency serialization
// (the dynamic-AWB couriers — J&T, Ninja, SiCepat — do).
const chosen = services.find((row) => row.providerService === "JNE") ?? services[0];
if (!chosen) throw new Error("No supported courier for this route; nothing was created.");
// The courier is the leading alphabetic run of the service key: "JNECargo" is
// JNE's cargo service, not a courier called JNECargo.
const courierCode = (chosen.providerService.match(/^[A-Za-z]+?(?=[A-Z][a-z]|$)/) ?? [chosen.providerService])[0];

// 2. Every candidate spelling, each with its own sentinel, in one order.
const stamp = Date.now().toString(36).toUpperCase().slice(-6);
const sentinel = (slot) => `UJI-${stamp}-${slot}`;
const CANDIDATES = {
  shipping_instruction: sentinel("SI1"),
  shippingInstruction: sentinel("SI2"),
  instruction: sentinel("SI3"),
  note: sentinel("SI4"),
  destinationMark: sentinel("SI5"),
  receiver_landmark: sentinel("LM1"),
  receiverLandmark: sentinel("LM2"),
  receiver_addr2: sentinel("LM3"),
  RECEIVER_ADDR2: sentinel("LM4"),
  is_hazardous: true,
  isHazardous: true,
  isDangerousGoods: true,
};

// `minimal` sends only the base payload, so a refusal separates "our base shape
// is wrong" from "the candidate keys are rejected". `candidates` adds all twelve.
const variant = process.env.MENGANTAR_ORDER_VARIANT ?? "candidates";
const order = {
  pickup_address_id: pickupAddressId,
  sender_name: "GeraiCUAN Uji Kontrak",
  sender_phone: "081200000000",
  sender_address: "Uji kontrak API GeraiCUAN",
  receiver_name: "UJI COBA SISTEM - MOHON DIBATALKAN",
  receiver_phone: "081200000001",
  receiver_address: "Uji coba kontrak API GeraiCUAN - bukan kiriman nyata, mohon dibatalkan",
  destination_id: destinationId,
  courier: courierCode,
  service: chosen.providerService,
  weight: 1,
  quantity: 1,
  item_name: `UJI KONTRAK ${stamp} - BATALKAN`,
  goods_value: 10000,
  is_cod: false,
  cod_amount: 0,
  ...(variant === "minimal" ? {} : CANDIDATES),
};

if (dryRun) {
  console.log(JSON.stringify({
    dryRun: true,
    chosenCourier: courierCode,
    chosenService: order.service,
    variant,
    candidateKeys: Object.keys(CANDIDATES),
    hint: `set MENGANTAR_CREATE_ORDER=${CONFIRMATION} to create one real order`,
  }));
  process.exit(0);
}

const created = await call("/order", { method: "POST", body: JSON.stringify([order]) });
const createdRecord = Array.isArray(created.body?.data) ? created.body.data[0] : null;
const orderId = createdRecord?.ORDER_ID ?? createdRecord?._id ?? null;

// 3. Read the order back: what the provider stored is what the provider accepted.
let readBack = null;
if (orderId) {
  const listUrl = endpoint("/order");
  listUrl.searchParams.set("page", "1");
  listUrl.searchParams.set("size", "10");
  const listController = new AbortController();
  const listTimeout = setTimeout(() => listController.abort(), 20_000);
  try {
    const response = await fetch(listUrl, { headers: { Accept: "application/json" }, signal: listController.signal });
    const body = JSON.parse(await response.text());
    readBack = (Array.isArray(body?.data) ? body.data : [])
      .find((record) => record?.ORDER_ID === orderId || record?._id === orderId) ?? null;
  } finally {
    clearTimeout(listTimeout);
  }
}

// Which sentinel survived, and under which stored key.
const survivors = {};
if (readBack) {
  const flat = JSON.stringify(readBack);
  for (const [key, value] of Object.entries(CANDIDATES)) {
    if (typeof value !== "string") continue;
    const storedUnder = Object.entries(readBack).find(([, stored]) => typeof stored === "string" && stored.includes(value));
    survivors[key] = storedUnder ? storedUnder[0] : (flat.includes(value) ? "present-but-nested" : null);
  }
  for (const key of ["isDangerousGoods", "isHazardous", "is_hazardous"]) {
    if (key in readBack) survivors[key] = `${key}=${String(readBack[key])}`;
  }
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify({
  contract: "POST /api/public/{key}/order — which request keys the provider accepts, proven by reading the created order back. No credential, no customer data.",
  capturedAt: new Date().toISOString().slice(0, 10),
  host: base.hostname,
  route: "origin == destination (provider account default area)",
  courier: courierCode,
  service: order.service,
  isCod: false,
  requestKeysSent: Object.keys(order).sort(),
  candidateKeys: Object.keys(CANDIDATES),
  createHttpStatus: created.status,
  createSuccess: created.body?.success ?? null,
  variant,
  createMessage: typeof created.body?.message === "string" ? created.body.message.slice(0, 300) : null,
  /** The provider's refusal, verbatim minus anything identifying. */
  createBody: created.body === null ? { nonJson: true } : JSON.parse(
    JSON.stringify(created.body).replace(/"[^"]*081200000\d{3}[^"]*"/g, '"[REDACTED]"'),
  ),
  orderCreated: Boolean(orderId),
  isPaid: createdRecord?.isPaid ?? readBack?.isPaid ?? null,
  awbIssued: Boolean(createdRecord?.cnote_no ?? readBack?.cnote_no),
  storedKeys: readBack ? Object.keys(readBack).sort() : null,
  /** key sent -> stored key it landed in, or null when the provider dropped it. */
  survivors,
}, null, 2)}\n`);

console.log(JSON.stringify({
  createHttpStatus: created.status,
  createSuccess: created.body?.success ?? null,
  orderCreated: Boolean(orderId),
  // The owner needs this to cancel the order, and it is their own reference.
  orderId,
  awb: createdRecord?.cnote_no ?? readBack?.cnote_no ?? null,
  isPaid: createdRecord?.isPaid ?? readBack?.isPaid ?? null,
  survivors,
  outputPath,
}, null, 2));
