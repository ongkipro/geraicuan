/**
 * The non-secret outlet facts both settings pages render. Never carries a
 * credential, a secret reference, or a credential-bearing URL.
 */
export type SafeOutletReadiness = {
  id: string;
  name: string;
  defaultPickupAddressId: string | null;
  defaultPickupAddressLabel: string | null;
  defaultOriginAreaId: string | null;
  defaultOriginAreaLabel: string | null;
  connectionIssue: "authentication" | "provider_unavailable" | "secret_unavailable" | null;
  connectionSource: "platform_default" | "private";
  connectionStatus: "platform_default" | "private_ready" | "private_attention";
  connectionUpdatedAtLabel: string | null;
  readinessStatus: "ready" | "needs_attention";
  updatedAtLabel: string;
  /** D-9: this store ships on its own Mengantar account only. */
  privateConnectionRequired?: boolean;
};

/** Which parts of an outlet's configuration are still missing, in Indonesian. */
export function missingOutletConfiguration(outlet: SafeOutletReadiness) {
  const hasLegacyLocation = Boolean(
    (outlet.defaultPickupAddressId || outlet.defaultOriginAreaId)
    && (
      !outlet.defaultPickupAddressId
      || !outlet.defaultPickupAddressLabel
      || !outlet.defaultOriginAreaId
      || !outlet.defaultOriginAreaLabel
    ),
  );
  const missing: string[] = [];
  if (!outlet.defaultPickupAddressId) missing.push("alamat pickup");
  if (!outlet.defaultOriginAreaId) missing.push("area asal");
  if (hasLegacyLocation) missing.push("label lokasi Mengantar");
  if (outlet.connectionStatus === "private_attention") missing.push("koneksi Mengantar");
  if (outlet.privateConnectionRequired && outlet.connectionSource !== "private") {
    missing.push("akun Mengantar milik gerai");
  }
  return missing;
}
