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
