import type { PrintEventRecord } from "@/db/label-print-repository";

/** The history line's result word; a blocked attempt names its guard. */
export function printEventOutcome(event: Pick<PrintEventRecord, "outcome" | "reasonCode">) {
  if (event.outcome === "PRINTED") return "Tercatat";
  if (event.reasonCode === "CANCELLED") return "Diblokir: kiriman dibatalkan";
  return event.reasonCode === "AWAITING_UPSTREAM_PAYMENT" ? "Diblokir: menunggu pelunasan" : "Diblokir: resi belum terbit";
}
