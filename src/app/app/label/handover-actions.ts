"use server";

import { MAX_BATCH_SHIPMENTS } from "@/app/app/label/cetak/batch-query";
import { parseLabelQuery } from "@/app/app/label/label-query";
import { requireTenantPrincipal } from "@/app/app/pengiriman/_list/tenant-page";
import { db } from "@/db/client";
import { loadLabelIndexPage } from "@/db/label-print-repository";
import {
  HandoverInputError,
  type HandoverUndoOutcome,
  markShipmentsHandedOver,
  undoShipmentHandover,
} from "@/db/shipment-handover-repository";
import { TenantContextDeniedError, withTenantContext } from "@/db/tenant-context";
import { parseAnalyticsRange } from "@/lib/analytics-range";
import {
  HANDOVER_REFUSAL_LABELS,
  isHandoverMethod,
  normalizeHandoverNote,
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
  /** LBL-PRINTED for the same filter: every parcel ready for handover, not only the ones returned. */
  total: number;
  /** Planned handover type per returned number (the dialog's default method). */
  types: Record<number, "PICKUP" | "DROP_OFF" | null>;
};

/**
 * T-267 "Pilih semua siap diserahkan": T-266's pattern for the Siap diserahkan queue — the
 * session's tenant, the page's filter re-parsed here, the print state forced to "sudah", the same
 * loader as the list.
 */
export async function selectReadyForHandover(params: Record<string, string>): Promise<ReadySelection> {
  const principal = await requireTenantPrincipal();
  const search: Record<string, string> = {};
  if (params && typeof params === "object") {
    for (const key of ["q", "rentang", "khusus", "dari", "sampai", "tz"]) {
      const value = (params as Record<string, unknown>)[key];
      if (typeof value === "string") search[key] = value.slice(0, 64);
    }
  }
  const query = parseLabelQuery(search);
  if (query.awbSuffixError) return { numbers: [], total: 0, types: {} };
  const range = parseAnalyticsRange(search, new Date());
  const page = await withTenantContext(db, principal.userId, principal.tenantId, (tx, context) =>
    loadLabelIndexPage(tx, context, { awbSuffix: query.awbSuffix || undefined, printState: "sudah", range, status: "issued" }));
  const rows = page.rows.slice(0, MAX_BATCH_SHIPMENTS);
  const numbers = rows.map((row) => Number(shipmentNumberFromReference(row.publicReference)));
  return {
    numbers,
    total: page.summary["LBL-PRINTED"],
    types: Object.fromEntries(rows.map((row, index) => [numbers[index], row.handoverType])),
  };
}
