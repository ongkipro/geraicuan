import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const required = [
  "MENGANTAR_API_KEY",
  "MENGANTAR_BASE_URL",
  "MENGANTAR_ORIGIN_AREA_ID",
];
for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} is required.`);
}

const outputPath = resolve(process.env.MENGANTAR_SANDBOX_FIXTURE_PATH ?? "tests/fixtures/mengantar-estimate.sandbox.json");
const baseUrl = process.env.MENGANTAR_BASE_URL.replace(/\/$/, "");
const key = process.env.MENGANTAR_API_KEY;
const originId = process.env.MENGANTAR_ORIGIN_AREA_ID;
const requestUrl = new URL(`${baseUrl}/api/public/${key}/order/estimate`);
requestUrl.searchParams.set("origin_id", originId);
requestUrl.searchParams.set("destination_id", originId);
requestUrl.searchParams.set("courier", "all");
requestUrl.searchParams.set("weight", "1");

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 15_000);
let response;
try {
  response = await fetch(requestUrl, {
    headers: { Accept: "application/json" },
    signal: controller.signal,
  });
} finally {
  clearTimeout(timeout);
}

const responseText = await response.text();
let body;
try {
  body = JSON.parse(responseText);
} catch {
  throw new Error(`Mengantar estimate returned non-JSON HTTP ${response.status}.`);
}
const sensitiveKey = /(?:address|api[_-]?key|destinationid|email|name|originid|phone|pickup|token|user)/i;
function sanitize(value, keyName = "") {
  if (sensitiveKey.test(keyName)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((item) => sanitize(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitize(item, key)]));
  }
  return value;
}

const fixture = {
  capturedAt: new Date().toISOString(),
  environment: "sandbox",
  request: {
    courier: "all",
    destination: "same-as-origin",
    payment: "NON_COD",
    weightKg: 1,
  },
  response: {
    body: sanitize(body),
    status: response.status,
  },
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(fixture, null, 2)}\n`, { mode: 0o600 });
console.log(`Sanitized Mengantar estimate captured: HTTP ${response.status}.`);
