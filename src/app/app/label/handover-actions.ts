"use server";

import { MAX_BATCH_SHIPMENTS } from "@/app/app/label/cetak/batch-query";
import { parseLabelQuery } from "@/app/app/label/label-query";
import { requireTenantPrincipal } from "@/app/app/pengiriman/_list/tenant-page";
import { db } from "@/db/client";
import { loadLabelIndexPage } from "@/db/label-print-repository";
import {
  findHandoverScanTarget,
  HandoverInputError,
  type HandoverUndoOutcome,
  markShipmentsHandedOver,
  undoShipmentHandover,
} from "@/db/shipment-handover-repository";
import { TenantContextDeniedError, withTenantContext } from "@/db/tenant-context";
import { createProcessWindowLimiter } from "@/lib/location-search-rate-limit";
import {
  HANDOVER_REFUSAL_LABELS,
  type HandoverScanResult,
  isHandoverMethod,
  normalizeHandoverNote,
  normalizeHandoverScan,
} from "@/lib/shipment-handover";
import { shipmentNumberFromReference } from "@/lib/shipment-number";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type HandoverMarkResult =
  | {
      ok: true;
      marked: number;
      /** Already handed over: nothing recorded twice. */
      already: number;
      /** "GC-10012: Label belum pernah dicetak", one line per refused parcel. */
      refused: string[];
    }
  | { ok: false; error: string };

/**
 * T-267 "Tandai sudah diserahkan": the tenant is the session's, never an input; the numbers are
 * the tenant's own shipment numbers (at most one print batch); the method is PICKUP or DROP_OFF;
 * the note is optional, at most 160 characters. Eligibility, locks and idempotency are the
 * repository's, in one transaction; both tenant roles may record a handover.
 */
export async function markShipmentsHandedOverAction(input: { method: unknown; note?: unknown; numbers: unknown }): Promise<HandoverMarkResult> {
  const principal = await requireTenantPrincipal();
  const numbers = Array.isArray(input?.numbers) ? input.numbers : null;
  if (!numbers || numbers.length === 0 || numbers.length > MAX_BATCH_SHIPMENTS || !numbers.every((value) => Number.isSafeInteger(value))) {
    return { error: `Pilih 1–${MAX_BATCH_SHIPMENTS} paket.`, ok: false };
  }
  if (!isHandoverMethod(input.method)) return { error: "Pilih cara penyerahan.", ok: false };
  const note = normalizeHandoverNote(input.note);
  if (!note.ok) return { error: "Catatan paling banyak 160 karakter.", ok: false };
  try {
    const rows = await withTenantContext(db, principal.userId, principal.tenantId, (tx, context) =>
      markShipmentsHandedOver(tx, context, { method: input.method as "PICKUP" | "DROP_OFF", note: note.note, numbers: numbers as number[] }));
    return {
      already: rows.filter((row) => row.outcome === "ALREADY").length,
      marked: rows.filter((row) => row.outcome === "MARKED").length,
      ok: true,
      refused: rows.flatMap((row) => row.outcome === "REFUSED" && row.reason
        ? [`${row.publicReference ?? `Nomor ${row.number}`}: ${HANDOVER_REFUSAL_LABELS[row.reason]}`]
        : []),
    };
  } catch (error) {
    if (error instanceof TenantContextDeniedError) throw error;
    if (error instanceof HandoverInputError) return { error: `Pilih 1–${MAX_BATCH_SHIPMENTS} paket.`, ok: false };
    console.error("Handover could not be recorded.", error instanceof Error ? error.name : "unknown");
    return { error: "Penyerahan tidak dapat dicatat. Tidak ada yang berubah; coba lagi.", ok: false };
  }
}

export type HandoverUndoResult = { ok: true; message: string } | { ok: false; error: string };

/** One message per undo refusal; a shipment that left ISSUED otherwise is not "not found". */
const UNDO_REFUSAL_MESSAGES: Record<Extract<HandoverUndoOutcome, { outcome: "REFUSED" }>["reason"], string> = {
  NOT_FOUND: "Kiriman tidak ditemukan.",
  NOT_ISSUED: "Tidak dapat dibatalkan: status kiriman sudah berubah. Muat ulang halaman untuk melihat status terbarunya.",
  ORDER_CANCELLED: "Tidak dapat dibatalkan: pesanan dibatalkan Mengantar.",
  PICKED_UP: "Tidak dapat dibatalkan: Mengantar sudah mencatat scan kurir.",
};

/**
 * "Batalkan penandaan": both tenant roles, while Mengantar has not reported the pickup scan.
 * Recorded as an UNDONE event; the handover stays in the history.
 */
export async function undoShipmentHandoverAction(shipmentId: unknown): Promise<HandoverUndoResult> {
  const principal = await requireTenantPrincipal();
  if (typeof shipmentId !== "string" || !UUID_PATTERN.test(shipmentId)) return { error: "Kiriman tidak ditemukan.", ok: false };
  try {
    const outcome = await withTenantContext(db, principal.userId, principal.tenantId, (tx, context) =>
      undoShipmentHandover(tx, context, shipmentId));
    if (outcome.outcome === "UNDONE") return { message: "Penandaan dibatalkan. Paket kembali ke Siap diserahkan.", ok: true };
    if (outcome.outcome === "ALREADY") return { message: "Paket ini tidak sedang ditandai diserahkan.", ok: true };
    return { error: UNDO_REFUSAL_MESSAGES[outcome.reason], ok: false };
  } catch (error) {
    if (error instanceof TenantContextDeniedError) throw error;
    console.error("Handover undo could not be recorded.", error instanceof Error ? error.name : "unknown");
    return { error: "Pembatalan tidak dapat dicatat. Coba lagi.", ok: false };
  }
}

export type ReadySelection = {
  /** Shipment numbers, newest first, at most MAX_BATCH_SHIPMENTS. */
  numbers: number[];
  /** T-270: the resi per returned number, for the dialog's list of chosen parcels. */
  awbs: Record<number, string>;
  /** LBL-PRINTED for the same filter: every parcel ready for handover, not only the ones returned. */
  total: number;
  /** Planned handover type per returned number (the dialog's default method). */
  types: Record<number, "PICKUP" | "DROP_OFF" | null>;
};

/**
 * T-267 "Pilih semua siap diserahkan": T-266's pattern for the Siap diserahkan queue — the
 * session's tenant, the page's suffix filter re-parsed here, the print state forced to "sudah",
 * the same loader as the list. T-270: the queue has no period, so none is read.
 */
export async function selectReadyForHandover(params: Record<string, string>): Promise<ReadySelection> {
  const principal = await requireTenantPrincipal();
  const q = params && typeof params === "object" ? (params as Record<string, unknown>).q : undefined;
  const query = parseLabelQuery(typeof q === "string" ? { q: q.slice(0, 64) } : {});
  if (query.awbSuffixError) return { awbs: {}, numbers: [], total: 0, types: {} };
  const page = await withTenantContext(db, principal.userId, principal.tenantId, (tx, context) =>
    loadLabelIndexPage(tx, context, { awbSuffix: query.awbSuffix || undefined, printState: "sudah", status: "issued" }));
  const rows = page.rows.slice(0, MAX_BATCH_SHIPMENTS);
  const numbers = rows.map((row) => Number(shipmentNumberFromReference(row.publicReference)));
  return {
    awbs: Object.fromEntries(rows.flatMap((row, index) => (row.awb ? [[numbers[index], row.awb]] : []))),
    numbers,
    total: page.summary["LBL-PRINTED"],
    types: Object.fromEntries(rows.map((row, index) => [numbers[index], row.handoverType])),
  };
}

/**
 * T-270: a keyboard-wedge scanner types about one code a second; 240 a minute per member leaves
 * room for bursts and still stops a runaway client. Process-local, like the wilayah search.
 */
const allowHandoverScan = createProcessWindowLimiter(240, 60 * 1000);

/**
 * T-270 "Scan resi" on Siap diserahkan: finds the one shipment of the session's tenant a scanned
 * resi or nomor kiriman names — anywhere in the queue, not only on the current page — and says
 * whether it can join the handover selection. Read only: nothing is recorded until "Tandai". The
 * scanned value is never logged, echoed in a URL or returned; the client keeps the selection
 * (duplicates and the 50 cap are decided there, against what is already chosen).
 */
export async function scanForHandover(raw: unknown): Promise<HandoverScanResult> {
  const principal = await requireTenantPrincipal();
  const scan = normalizeHandoverScan(raw);
  if (!scan) return { ok: false, publicReference: null, reason: "INVALID" };
  if (!allowHandoverScan(principal)) return { ok: false, publicReference: null, reason: "RATE_LIMITED" };
  try {
    const target = await withTenantContext(db, principal.userId, principal.tenantId, (tx, context) =>
      findHandoverScanTarget(tx, context, scan));
    if (!target) return { ok: false, publicReference: null, reason: "NOT_FOUND" };
    if (target.state !== "READY" || !target.awb) {
      return { ok: false, publicReference: target.publicReference, reason: target.state === "READY" ? "NOT_ISSUED" : target.state };
    }
    return { awb: target.awb, handoverType: target.handoverType, number: target.number, ok: true, publicReference: target.publicReference };
  } catch (error) {
    if (error instanceof TenantContextDeniedError) throw error;
    console.error("Handover scan could not be checked.", error instanceof Error ? error.name : "unknown");
    return { ok: false, publicReference: null, reason: "LOOKUP_FAILED" };
  }
}
