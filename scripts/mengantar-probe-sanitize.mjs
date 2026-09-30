/**
 * T-247 (review L7): the allow-list sanitizer for `probe-mengantar-order-documented.mjs`.
 *
 * The capture is committed under tests/fixtures, so nothing may reach it by default. Every
 * key name is kept (the key names ARE the contract), but a value is kept verbatim only for
 * the keys below, and only when it has the expected safe shape; every other value — names,
 * addresses, phones, notes, free-text messages, account identifiers — becomes a shape such
 * as "string(14)". A replacement pass over the kept strings still removes the credential
 * and the account identifiers the caller names, in case one is echoed in a kept field.
 *
 * T-268 (review L3): the test order's own identifiers (resi, order and batch ids) are real
 * provider records, so they are not kept either: each becomes a random synthetic value of the
 * same length and character classes (digit → digit, hex letter → hex letter, other lowercase →
 * lowercase, uppercase → uppercase; punctuation kept), the same replacement wherever one real
 * id repeats, so the parser still reads the contract's shape and cross-references.
 */
import { randomInt } from "node:crypto";

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
  // Identifiers of the created order and its batch (DATA-13 needs where batch_id sits):
  // replaced by same-shape synthetic values.
  _id: "orderIdentifier",
  id: "orderIdentifier",
  ORDER_ID: "orderIdentifier",
  order_id: "orderIdentifier",
  batch: "orderIdentifier",
  batch_id: "orderIdentifier",
  cnote_no: "orderIdentifier",
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

const DIGITS = "0123456789";
const HEX_LETTERS = "abcdef";
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const pick = (alphabet) => alphabet[randomInt(alphabet.length)];

/** A random value with `real`'s length and per-position character class, never `real` itself. */
export function syntheticIdentifier(real) {
  const hex = /^[0-9a-f]+$/.test(real);
  for (;;) {
    const out = [...real].map((char) => {
      if (/[0-9]/.test(char)) return pick(DIGITS);
      if (/[a-z]/.test(char)) return pick(hex ? HEX_LETTERS : LOWER);
      if (/[A-Z]/.test(char)) return pick(UPPER);
      return char;
    }).join("");
    if (out !== real || !/[A-Za-z0-9]/.test(real)) return out;
  }
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
 * @param {Map<string, string>} [synthetic] real order id → its synthetic replacement; pass one map
 *   to every call of one capture so an id repeated across request and response stays consistent
 */
export function sanitizeProbeCapture(value, replacements = [], synthetic = new Map()) {
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
    const kept = keep(kind === "orderIdentifier" ? "identifier" : kind, node);
    if (typeof kept !== "string") return kept;
    const redacted = redact(kept);
    // A kept order id: redacted text stays redacted; otherwise it never reaches the file verbatim.
    if (kind !== "orderIdentifier" || redacted !== kept || kept !== node) return redacted;
    if (!synthetic.has(kept)) synthetic.set(kept, syntheticIdentifier(kept));
    return synthetic.get(kept);
  };
  return walk(value ?? null, null);
}
