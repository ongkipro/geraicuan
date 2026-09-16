/**
 * T-175: how Mengantar actually builds and settles a COD order, proven from the
 * owner's own stored orders rather than read from a document.
 *
 * Read-only (`GET /order`). Nothing identifying and **no amount** reaches the
 * file: each identity is tested in memory per order and only the count of orders
 * it holds for is written, so a customer's order value never leaves the process.
 *
 * Why this exists: GeraiCUAN computed `COD = (goods + shipping) × 1.0333` on the
 * assumption that Mengantar's COD fee was a separate add-on, while two recorded
 * facts disagreed about where that fee lands — `COD_FEE = 3.33% × COD_AMOUNT`
 * (T-146) and `settlement = COD_AMOUNT − estimatedSpecialPrice` (554/554, PR-43,
 * with "does the special price include the fee?" left open). The identities
 * below close that question.
 *
 * Run through `secrets-env`, never with the key on a command line:
 *   secrets-env run -- node scripts/capture-mengantar-cod-identities.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

for (const name of ["MENGANTAR_API_KEY", "MENGANTAR_BASE_URL"]) {
  if (!process.env[name]) throw new Error(`${name} is required.`);
}

const base = new URL(process.env.MENGANTAR_BASE_URL);
const outputPath = resolve(process.env.MENGANTAR_COD_IDENTITIES_PATH ?? "tests/fixtures/mengantar-cod-identities.json");
const url = new URL(`/api/public/${encodeURIComponent(process.env.MENGANTAR_API_KEY)}/order`, base.origin);
url.searchParams.set("page", "1");
url.searchParams.set("size", process.env.MENGANTAR_COD_IDENTITIES_SIZE ?? "100");

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 20_000);
let body;
try {
  body = JSON.parse(await (await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal })).text());
} finally {
  clearTimeout(timeout);
}

const orders = (Array.isArray(body?.data) ? body.data : []).filter((order) => Number(order?.COD_AMOUNT) > 0);
const close = (a, b) => Math.abs(a - b) < 0.005;
const holds = {
  // The fee is exactly 3.33% of the COD amount — 3% plus 11% VAT on the 3% —
  // kept fractional, never rounded.
  codFeeIsExactly333BasisPointsOfCodAmount: 0,
  // The stored estimated price already contains that fee: this is what makes
  // `settlement = COD_AMOUNT − estimatedSpecialPrice` net the fee out.
  storedEstimatedPriceIsPricePlusCodFee: 0,
  // How the owner's own orders were built in Mengantar's UI: the buyer is
  // charged the goods value, and shipping plus fee come out of it.
  codAmountEqualsGoodsAmount: 0,
  codAmountEqualsGoodsPlusPrice: 0,
};
for (const order of orders) {
  const cod = Number(order.COD_AMOUNT);
  const fee = Number(order.COD_FEE);
  const price = Number(order.price);
  const estimated = Number(order.estimatedPrice);
  const goods = Number(order.GOODS_AMOUNT);
  if (close(fee, cod * 0.0333)) holds.codFeeIsExactly333BasisPointsOfCodAmount += 1;
  if (close(estimated, price + fee)) holds.storedEstimatedPriceIsPricePlusCodFee += 1;
  if (cod === goods) holds.codAmountEqualsGoodsAmount += 1;
  if (cod === goods + price) holds.codAmountEqualsGoodsPlusPrice += 1;
}

// T-178: the settlement side. Reconciliation invoice subItems carry the price
// Mengantar actually deducted (`estimatedSpecialPrice`); stored orders do not
// carry that field at all. Joined to the order by `cnote_no` it shows whether
// the deducted price contains the COD fee, and it shows how often a real
// invoice holds a value the pull's whole-rupiah parser rejects.
const invoiceUrl = new URL(`/api/public/${encodeURIComponent(process.env.MENGANTAR_API_KEY)}/invoices`, base.origin);
const seenInvoices = new Set();
const subItems = [];
let invoicesWithFraction = 0;
for (let page = 1; page <= Number(process.env.MENGANTAR_COD_IDENTITIES_INVOICE_PAGES ?? "12"); page += 1) {
  invoiceUrl.searchParams.set("page", String(page));
  invoiceUrl.searchParams.set("size", "50");
  invoiceUrl.searchParams.set("invoiceFilter", "typeReconciliation");
  const invoiceBody = JSON.parse(await (await fetch(invoiceUrl, { headers: { Accept: "application/json" } })).text());
  const invoices = Array.isArray(invoiceBody?.data) ? invoiceBody.data : [];
  let fresh = 0;
  for (const invoice of invoices) {
    if (seenInvoices.has(invoice?._id)) continue;
    seenInvoices.add(invoice?._id);
    fresh += 1;
    let fractional = !Number.isInteger(Number(invoice?.amount));
    for (const item of Array.isArray(invoice?.subItems) ? invoice.subItems : []) {
      if (!Number.isInteger(Number(item?.amount))) fractional = true;
      if (item?.estimatedSpecialPrice != null && !Number.isInteger(Number(item.estimatedSpecialPrice))) fractional = true;
      if (Number(item?.COD_AMOUNT) > 0) subItems.push(item);
    }
    if (fractional) invoicesWithFraction += 1;
  }
  if (invoices.length === 0 || fresh === 0) break;
}
const orderByCnote = new Map();
const orderPage = new URL(url);
for (let page = 1; page <= Number(process.env.MENGANTAR_COD_IDENTITIES_ORDER_PAGES ?? "30"); page += 1) {
  orderPage.searchParams.set("page", String(page));
  orderPage.searchParams.set("size", "100");
  const pageBody = JSON.parse(await (await fetch(orderPage, { headers: { Accept: "application/json" } })).text());
  const rows = Array.isArray(pageBody?.data) ? pageBody.data : [];
  let fresh = 0;
  for (const row of rows) {
    if (row?.cnote_no && !orderByCnote.has(String(row.cnote_no))) {
      orderByCnote.set(String(row.cnote_no), row);
      fresh += 1;
    }
  }
  if (rows.length === 0 || fresh === 0) break;
}
const settlement = {
  reconciliationInvoices: seenInvoices.size,
  codSubItems: subItems.length,
  // What the pull already assumes, and it holds.
  settledAmountIsCodMinusSpecialPrice: 0,
  // What it would be if the fee were deducted a second time. It never is.
  settledAmountIsCodMinusSpecialPriceMinusFee: 0,
  codFeeIsExactly333BasisPointsOfCodAmount: 0,
  joinedToAnOrder: 0,
  // If the deducted price did not contain the fee, a large COD (fee above the
  // shipping) would routinely show a price below its own fee.
  specialPriceMinusFeeWithinZeroAndNormalPrice: 0,
  specialPriceBelowItsOwnFee: 0,
  specialPriceEqualsPlainNormalPrice: 0,
  // A pull aborts on the first of these: `wholeIdr` rejects a fraction.
  subItemsWithFractionalAmount: 0,
  // T-178 parses to four decimal places after reading a double at 15
  // significant digits. These say whether the provider's JSON ever needs more
  // than two places, more than four as sent (binary noise included), or more
  // than four after that read — the last must stay 0 for the pull to accept it.
  subItemsNeedingMoreThanTwoDecimals: 0,
  subItemsSentWithMoreThanFourDecimals: 0,
  subItemsWithMoreThanFourDecimalsAt15Digits: 0,
  invoicesThePullCannotParse: invoicesWithFraction,
};
for (const item of subItems) {
  const cod = Number(item.COD_AMOUNT);
  const special = Number(item.estimatedSpecialPrice);
  const fee = Number(item.COD_FEE);
  const amount = Number(item.amount);
  if (close(amount, cod - special)) settlement.settledAmountIsCodMinusSpecialPrice += 1;
  if (close(amount, cod - special - fee)) settlement.settledAmountIsCodMinusSpecialPriceMinusFee += 1;
  if (close(fee, cod * 0.0333)) settlement.codFeeIsExactly333BasisPointsOfCodAmount += 1;
  if (special < fee) settlement.specialPriceBelowItsOwnFee += 1;
  if (!Number.isInteger(amount)) settlement.subItemsWithFractionalAmount += 1;
  const places = (value, read) => (String(read(Number(value))).split(".")[1] ?? "").length;
  const moneyFields = [item.amount, item.estimatedSpecialPrice, item.COD_FEE].filter((value) => value != null);
  const at15 = (value) => Number(value.toPrecision(15));
  if (moneyFields.some((value) => places(value, at15) > 2)) settlement.subItemsNeedingMoreThanTwoDecimals += 1;
  if (moneyFields.some((value) => places(value, (read) => read) > 4)) settlement.subItemsSentWithMoreThanFourDecimals += 1;
  if (moneyFields.some((value) => places(value, at15) > 4)) settlement.subItemsWithMoreThanFourDecimalsAt15Digits += 1;
  const order = orderByCnote.get(String(item.cnote_no));
  if (!order) continue;
  settlement.joinedToAnOrder += 1;
  const shipping = special - fee;
  if (shipping >= -0.005 && shipping <= Number(order.price) + 0.005) settlement.specialPriceMinusFeeWithinZeroAndNormalPrice += 1;
  if (close(special, Number(order.price))) settlement.specialPriceEqualsPlainNormalPrice += 1;
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify({
  contract: "GET /api/public/{key}/order — COD construction and settlement identities, as counts of orders each holds for. No amount, no identity, no credential.",
  capturedAt: new Date().toISOString().slice(0, 10),
  host: base.hostname,
  codOrdersInspected: orders.length,
  holds,
  settlement,
  estimateEndpointCodFee: "GET /order/estimate returns codFee: 0 for every service at cod_amount 0, 100000, 500000 and 1000000 (2026-09-16), so the fee is only observable on a stored order.",
}, null, 2)}\n`);
console.log(JSON.stringify({ codOrdersInspected: orders.length, holds, settlement, outputPath }));
