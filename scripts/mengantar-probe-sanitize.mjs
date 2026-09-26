/**
 * T-247 (review L7): the allow-list sanitizer for `probe-mengantar-order-documented.mjs`.
 *
 * The capture is committed under tests/fixtures, so nothing may reach it by default. Every
 * key name is kept (the key names ARE the contract), but a value is kept verbatim only for
 * the keys below, and only when it has the expected safe shape; every other value — names,
 * addresses, phones, notes, free-text messages, account identifiers — becomes a shape such
 * as "string(14)". A replacement pass over the kept strings still removes the credential
 * and the account identifiers the caller names, in case one is echoed in a kept field.
 */
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;
const SAFE_CODE = /^[A-Z0-9_]{1,64}$/;

/** Keys whose value is structural or an identifier of the test order itself, never a person. */
const KEEP = {
  // Envelope and outcome.
  success: "boolean",
  code: "code",
  status: "code",
  isPaid: "boolean",
  count: "number",
  total: "number",
  // Identifiers of the created order and its batch (DATA-13 needs where batch_id sits).
  _id: "identifier",
  id: "identifier",
  ORDER_ID: "identifier",
  order_id: "identifier",
  batch: "identifier",
  batch_id: "identifier",
  cnote_no: "identifier",
  // Request fields that carry no person and no account identifier.
  courier: "identifier",
  type: "identifier",
  weight: "number",
  quantity: "number",
  goodsValue: "number",
  isDangerousGoods: "boolean",
};

const MAX_ARRAY_ITEMS = 3;

function shape(value) {
  if (value === null) return null;
  if (typeof value === "string") return `string(${value.length})`;
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  if (typeof value === "boolean") return "boolean";
  return typeof value;
}

function keep(kind, value) {
  if (kind === "boolean") return typeof value === "boolean" ? value : shape(value);
  if (kind === "number") return typeof value === "number" && Number.isFinite(value) ? value : shape(value);
  if (kind === "code") return typeof value === "string" && SAFE_CODE.test(value) ? value : shape(value);
  return typeof value === "string" && SAFE_IDENTIFIER.test(value) ? value : shape(value);
}

/**
 * @param {unknown} value the parsed request or response
 * @param {Array<[string | undefined, string]>} [replacements] secret → label, applied to kept strings
 */
export function sanitizeProbeCapture(value, replacements = []) {
  const redact = (text) => {
    let out = text;
    for (const [secret, label] of replacements) if (secret) out = out.replaceAll(secret, label);
    return out;
  };
  const walk = (node, key) => {
    if (Array.isArray(node)) return node.slice(0, MAX_ARRAY_ITEMS).map((item) => walk(item, key));
    if (node && typeof node === "object") {
      return Object.fromEntries(Object.entries(node).map(([childKey, child]) => [childKey, walk(child, childKey)]));
    }
    const kind = key !== null && Object.hasOwn(KEEP, key) ? KEEP[key] : null;
    if (!kind) return shape(node);
    const kept = keep(kind, node);
    return typeof kept === "string" ? redact(kept) : kept;
  };
  return walk(value ?? null, null);
}
