/**
 * A `wa.me` link the user sends themselves (no WhatsApp API, nothing leaves the server). Only an
 * Indonesian mobile number: "08…" (the stored canonical form), "62…" or "+62…" become "62…";
 * anything else — a foreign number, a fragment — yields null so no wrong link is shown.
 */
export function whatsappHref(phone: string, text?: string) {
  const digits = phone.replace(/\D/g, "");
  const international = digits.startsWith("62") ? digits : digits.startsWith("0") ? `62${digits.slice(1)}` : null;
  if (!international || !/^628\d{7,12}$/.test(international)) return null;
  return `https://wa.me/${international}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/** The statuses whose parcel is on its way to the recipient; a return or a delivered parcel is not "sudah dikirim". */
const SHAREABLE = new Set(["ISSUED", "IN_TRANSIT"]);

/**
 * T-287 (market scan gap 4): the message a gerai sends a walk-in customer once the resi exists —
 * the courier's own resi, so it can be tracked on the courier's site; no amounts, no address. The
 * sender is the name on the label (the masked sender when masking is on); without one the
 * sentence names no sender rather than the gerai.
 */
export function resiWhatsappText(input: { recipientName: string; senderName: string | null; courierService: string; resi: string }) {
  const from = input.senderName ? ` dari ${input.senderName}` : "";
  return `Halo ${input.recipientName}, paket Anda${from} sudah dikirim dengan ${input.courierService}. Nomor resi: ${input.resi}.`;
}

/** The detail rail's link, or null unless the parcel is on its way and the phone is a valid one. */
export function resiWhatsappHref(input: { status: string; phone: string; recipientName: string; senderName: string | null; courierService: string; resi: string | null }) {
  if (!SHAREABLE.has(input.status) || !input.resi) return null;
  return whatsappHref(input.phone, resiWhatsappText({ ...input, resi: input.resi }));
}
