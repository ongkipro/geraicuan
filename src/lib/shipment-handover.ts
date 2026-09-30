// T-267 "Tandai sudah diserahkan": the words, limits and rules shared by the server and the
// client. No schema import (this file reaches client components).

export const HANDOVER_METHODS = ["PICKUP", "DROP_OFF"] as const;
export type HandoverMethod = (typeof HANDOVER_METHODS)[number];

export function isHandoverMethod(value: unknown): value is HandoverMethod {
  return value === "PICKUP" || value === "DROP_OFF";
}

/** The method as the operator chooses it in the dialog. */
export const HANDOVER_METHOD_CHOICES: Record<HandoverMethod, { label: string; description: string }> = {
  PICKUP: { description: "Kurir mengambil paket di gerai.", label: "Dijemput kurir" },
  DROP_OFF: { description: "Paket diantar ke outlet kurir.", label: "Diantar ke outlet" },
};

/** The method inside a sentence: "… oleh Rina · dijemput kurir". */
export const HANDOVER_METHOD_PHRASES: Record<HandoverMethod, string> = {
  DROP_OFF: "diantar ke outlet",
  PICKUP: "dijemput kurir",
};

/** A courier name or similar; the column CHECK allows 1–160 characters, trimmed. */
export const HANDOVER_NOTE_MAX = 160;

/**
 * The note as stored: trimmed, inner whitespace (line breaks, tabs) folded to one space, control
 * characters dropped; empty → null. Longer than the limit is refused, never cut.
 */
export function normalizeHandoverNote(input: unknown): { ok: true; note: string | null } | { ok: false } {
  if (input === undefined || input === null) return { ok: true, note: null };
  if (typeof input !== "string") return { ok: false };
  const note = input.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (note.length === 0) return { ok: true, note: null };
  if (note.length > HANDOVER_NOTE_MAX) return { ok: false };
  return { ok: true, note };
}

/** Why a selected parcel was not marked; one reason per row. */
export type HandoverRefusal = "NOT_FOUND" | "NOT_ISSUED" | "NOT_PRINTED" | "PICKED_UP" | "ORDER_CANCELLED";

export const HANDOVER_REFUSAL_LABELS: Record<HandoverRefusal, string> = {
  NOT_FOUND: "Kiriman tidak ditemukan",
  NOT_ISSUED: "Resi belum terbit",
  NOT_PRINTED: "Label belum pernah dicetak",
  ORDER_CANCELLED: "Dibatalkan Mengantar",
  PICKED_UP: "Sudah discan kurir di Mengantar",
};

/**
 * Spec 19 QUE-HANDOVER-OVERDUE: a parcel handed over this long ago that Mengantar still reports
 * as not picked up (status ISSUED) needs a look — "Diserahkan, belum discan kurir".
 */
export const HANDOVER_ATTENTION_HOURS = 24;
export const HANDOVER_ATTENTION_LABEL = "Diserahkan, belum discan kurir";

export function handoverOverdue(input: { handedOverAt: Date | null; status: string }, now: Date) {
  return input.status === "ISSUED"
    && input.handedOverAt !== null
    && now.getTime() - input.handedOverAt.getTime() >= HANDOVER_ATTENTION_HOURS * 3_600_000;
}

/** Undo is allowed while Mengantar has not reported the pickup scan: the shipment is still ISSUED. */
export function handoverUndoAllowed(input: { handedOverAt: Date | null; status: string }) {
  return input.status === "ISSUED" && input.handedOverAt !== null;
}

const shortDate = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" });
const shortTime = new Intl.DateTimeFormat("id-ID", { timeStyle: "short", timeZone: "Asia/Jakarta" });

/** "30 Sep, 14.05 WIB" — the recorded server time in WIB. */
export function formatHandoverTime(value: Date) {
  return `${shortDate.format(value)}, ${shortTime.format(value)} WIB`;
}

/** "Diserahkan 30 Sep, 14.05 WIB oleh Rina · dijemput kurir". */
export function handoverRecordText(input: { actorName: string | null; handedOverAt: Date; method: HandoverMethod }) {
  const actor = input.actorName?.trim() || "anggota gerai";
  return `Diserahkan ${formatHandoverTime(input.handedOverAt)} oleh ${actor} · ${HANDOVER_METHOD_PHRASES[input.method]}`;
}

/**
 * T-270 "Scan resi": what a keyboard-wedge scanner (or a person) typed into the Siap diserahkan
 * field. Control characters and whitespace (a scanner's CR/LF/Tab suffix) are dropped and the
 * rest upper-cased. `reference` is a prefixed nomor kiriman (GC-10123, matched exactly); `number`
 * an unprefixed one (10123, which can also be an all-digit resi — the resi wins). null = unusable.
 */
export function normalizeHandoverScan(input: unknown): { code: string; number: number | null; reference: string | null } | null {
  if (typeof input !== "string" || input.length > 200) return null;
  const code = input.replace(/[\u0000- \u007f ]+/g, "").toUpperCase();
  if (!/^[A-Z0-9-]{3,64}$/.test(code)) return null;
  const match = /^(?:([A-Z0-9]{2,5})-)?([1-9][0-9]{4,9})$/.exec(code);
  const tenantNumber = match ? Number(match[2]) : null;
  const valid = tenantNumber !== null && tenantNumber <= 2_147_483_647;
  return {
    code,
    number: valid && !match![1] ? tenantNumber : null,
    reference: valid && match![1] ? code : null,
  };
}

/** Why a scanned code was not added to the handover selection; one reason per scan. */
export type HandoverScanRefusal = HandoverRefusal | "INVALID" | "HANDED_OVER" | "RATE_LIMITED" | "LOOKUP_FAILED";

export type HandoverScanResult =
  | { ok: true; awb: string; handoverType: HandoverMethod | null; number: number; publicReference: string }
  | { ok: false; publicReference: string | null; reason: HandoverScanRefusal };

const SCAN_REFUSAL_MESSAGES: Record<HandoverScanRefusal, string> = {
  LOOKUP_FAILED: "Scan tidak dapat diperiksa. Coba scan lagi.",
  HANDED_OVER: "sudah ditandai diserahkan, menunggu scan kurir.",
  INVALID: "Kode tidak dikenali. Scan barcode resi atau ketik nomor kiriman, mis. GC-10123.",
  NOT_FOUND: "Resi atau nomor kiriman tidak ditemukan di gerai ini.",
  NOT_ISSUED: "resi belum terbit.",
  NOT_PRINTED: "label belum dicetak. Cetak dulu sebelum diserahkan.",
  ORDER_CANCELLED: "dibatalkan Mengantar. Jangan diserahkan ke kurir.",
  PICKED_UP: "sudah discan kurir di Mengantar.",
  RATE_LIMITED: "Terlalu banyak scan dalam semenit. Tunggu sebentar, lalu scan lagi.",
};

/** The inline line under the field for a refused scan: "GC-10123: label belum dicetak. …". */
export function handoverScanRefusalText(result: { publicReference: string | null; reason: HandoverScanRefusal }) {
  const message = SCAN_REFUSAL_MESSAGES[result.reason];
  return result.publicReference && /^[a-z]/.test(message) ? `${result.publicReference}: ${message}` : message;
}

export type HandoverScanOutcome =
  | { kind: "added"; number: number; text: string }
  | { kind: "duplicate"; number: number; text: string }
  | { kind: "cap" | "refused"; text: string };

/**
 * T-270: what one scan does to the selection the client holds — `chosen` is what is already
 * selected (this page and beyond), `max` the batch cap (50). A ready parcel already chosen is
 * never added twice; a full selection takes nothing more; a refusal says why.
 */
export function handoverScanOutcome(result: HandoverScanResult, chosen: ReadonlySet<number>, max: number): HandoverScanOutcome {
  if (!result.ok) return { kind: "refused", text: handoverScanRefusalText(result) };
  if (chosen.has(result.number)) {
    return { kind: "duplicate", number: result.number, text: `${result.publicReference} sudah dipilih. Tidak ditambahkan dua kali.` };
  }
  if (chosen.size >= max) {
    return { kind: "cap", text: `Maks. ${max} paket per penandaan. Tandai yang sudah dipilih dulu, lalu scan lagi.` };
  }
  return { kind: "added", number: result.number, text: `${result.publicReference} ditambahkan · ${chosen.size + 1} dipilih` };
}
