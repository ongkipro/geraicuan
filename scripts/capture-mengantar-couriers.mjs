/**
 * The courier catalogue, taken from the provider instead of maintained by hand.
 *
 * `GET /order/estimate?courier=all` answers with one entry per *service* key for
 * the route asked about. Those keys are the whole vocabulary a shipment can be
 * dispatched with, so they are what `MENGANTAR_COURIERS` and
 * `providerCourierFromService` have to cover. A service the estimate quotes and
 * our list does not name is a courier that silently vanishes from the dashboard
 * recap — which is exactly how `spx` (Shopee Express) went missing.
 *
 * Read-only. Writes key names and route-independent flags only: no price, no
 * credential, no address.
 *
 * Run through `secrets-env`, never with the key on a command line:
 *   secrets-env run -- node scripts/capture-mengantar-couriers.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

for (const name of ["MENGANTAR_API_KEY", "MENGANTAR_BASE_URL", "MENGANTAR_ORIGIN_AREA_ID"]) {
  if (!process.env[name]) throw new Error(`${name} is required.`);
}

const base = new URL(process.env.MENGANTAR_BASE_URL);
const apiKey = process.env.MENGANTAR_API_KEY;
const originId = process.env.MENGANTAR_ORIGIN_AREA_ID;
const outputPath = resolve(process.env.MENGANTAR_COURIER_CATALOGUE_PATH ?? "tests/fixtures/mengantar-couriers.catalogue.json");
const endpoint = (path) => new URL(`/api/public/${encodeURIComponent(apiKey)}${path}`, base.origin);

async function getJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
    return JSON.parse(await response.text());
  } finally {
    clearTimeout(timeout);
  }
}

// Several routes, because "unsupported" is a property of the route, not of the
// courier: asking about one destination would record a courier as missing when
// it simply does not serve that district.
const keywords = (process.env.MENGANTAR_COURIER_CATALOGUE_KEYWORDS ?? "Kelapa Gading,Coblong,Denpasar Barat").split(",");
const routes = [];
const services = new Map();
for (const keyword of keywords) {
  const search = endpoint("/address/search");
  search.searchParams.set("keyword", keyword.trim());
  const areaBody = await getJson(search);
  const areas = (Array.isArray(areaBody?.data) ? areaBody.data : Array.isArray(areaBody) ? areaBody : [])
    .filter((area) => area?._id && area._id !== originId);
  if (areas.length === 0) continue;
  const estimate = endpoint("/order/estimate");
  estimate.searchParams.set("origin_id", originId);
  estimate.searchParams.set("destination_id", areas[0]._id);
  estimate.searchParams.set("courier", "all");
  estimate.searchParams.set("weight", "1");
  const body = await getJson(estimate);
  const data = body?.data ?? {};
  const quoted = Object.keys(data);
  if (quoted.length === 0) continue;
  routes.push({
    destination: `${areas[0].DISTRICT_NAME ?? ""}, ${areas[0].CITY_NAME ?? ""}`.trim(),
    quoted: quoted.length,
    supported: quoted.filter((key) => data[key]?.unsupported !== true).length,
  });
  for (const key of quoted) {
    const seen = services.get(key) ?? { serviceKey: key, quotedOn: 0, supportedOn: 0, codSupportedOn: 0 };
    seen.quotedOn += 1;
    if (data[key]?.unsupported !== true) seen.supportedOn += 1;
    if (data[key]?.unsupported_cod === false) seen.codSupportedOn += 1;
    services.set(key, seen);
  }
}
if (services.size === 0) throw new Error("No route produced an estimate; nothing captured.");

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify({
  contract: "GET /api/public/{key}/order/estimate?courier=all — every service key the account can be quoted for. Key names and route counts only: no price, no credential, no address.",
  capturedAt: new Date().toISOString().slice(0, 10),
  host: base.hostname,
  routesSampled: routes,
  serviceKeys: [...services.keys()].sort(),
  services: [...services.values()].sort((a, b) => a.serviceKey.localeCompare(b.serviceKey)),
}, null, 2)}\n`);
console.log(JSON.stringify({ routes: routes.length, serviceKeys: services.size, outputPath }));
