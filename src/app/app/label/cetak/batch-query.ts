import { DEFAULT_LABEL_SIZE, type LabelSize } from "@/lib/label-size";

/**
 * PR-87 batch print URL: `/app/label/cetak?n=10175,10176&ukuran=10x15&isi=keduanya`.
 * Shipment numbers are the tenant's own counters (not PII); nothing else rides in the URL.
 */
export type BatchPrintContent = "label" | "invoice" | "keduanya";

export type BatchPrintQuery = {
  numbers: number[];
  size: LabelSize;
  content: BatchPrintContent;
  /** Entries of `n` that are not shipment numbers; they are dropped, never guessed. */
  invalid: string[];
};

/** Cetak resi pages 20 rows at a time; a batch never needs more than a few pages. */
export const MAX_BATCH_SHIPMENTS = 50;

/** The same form a route number takes (PR-44): five to ten digits, no leading zero. */
const SHIPMENT_NUMBER_PATTERN = /^[1-9][0-9]{4,9}$/;
const MAX_TENANT_NUMBER = 2_147_483_647;

export const BATCH_CONTENT_LABELS: Record<BatchPrintContent, string> = {
  invoice: "Invoice",
  keduanya: "Label + invoice",
  label: "Label",
};

export function includesLabels(content: BatchPrintContent) {
  return content !== "invoice";
}

export function includesInvoices(content: BatchPrintContent) {
  return content !== "label";
}

type SearchValue = string | string[] | undefined;
const first = (value: SearchValue) => (Array.isArray(value) ? value[0] : value);

export function parseBatchPrintQuery(params: Record<string, SearchValue>): BatchPrintQuery {
  const numbers: number[] = [];
  const invalid: string[] = [];
  for (const raw of (first(params.n) ?? "").split(",")) {
    const entry = raw.trim();
    if (!entry) continue;
    const value = Number(entry);
    if (!SHIPMENT_NUMBER_PATTERN.test(entry) || value > MAX_TENANT_NUMBER) invalid.push(entry.slice(0, 16));
    else if (!numbers.includes(value) && numbers.length < MAX_BATCH_SHIPMENTS) numbers.push(value);
  }
  const size = first(params.ukuran);
  const content = first(params.isi);
  return {
    content: content === "invoice" || content === "keduanya" ? content : "label",
    invalid,
    numbers,
    size: size === "10x10" || size === "10x15" ? size : DEFAULT_LABEL_SIZE,
  };
}

export function batchPrintHref(input: { numbers: readonly number[]; size: LabelSize; content: BatchPrintContent }) {
  const params = new URLSearchParams({ n: input.numbers.join(","), ukuran: input.size, isi: input.content });
  // Commas stay readable; they are safe in a query value.
  return `/app/label/cetak?${params.toString().replaceAll("%2C", ",")}`;
}
