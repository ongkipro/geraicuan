/**
 * Redaction helpers for personal data that must not be rendered in full.
 *
 * The rule this encodes: index and queue views show a masked number, and only a
 * single-object detail view or the printed label shows the whole one. Keep the
 * masking on the server so the unredacted value never reaches a browser payload
 * at all — a client-side mask still ships the original in the RSC stream.
 *
 * This lives in one module on purpose. It was previously copied into four
 * files, which is the shape where one copy quietly stops matching the others.
 */
export function maskPhone(phone: string) {
  const suffix = phone.replace(/\D/g, "").slice(-4);
  return suffix ? `•••• ${suffix}` : "Nomor tersimpan";
}
