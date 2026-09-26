import type { Metadata } from "next";

import { db } from "@/db/client";
import { withTenantContext } from "@/db/tenant-context";
import { loadTenantDisabledCouriers } from "@/db/tenant-settings-repository";

import { requireTenantAdmin, STORE_SETUP } from "../_components/settings-data";
import { CourierPreferences } from "./courier-preferences";

export const metadata: Metadata = { title: "Mitra kurir · Pengaturan", robots: { index: false } };

/** T-243: which Mengantar couriers this gerai offers in Cek tarif and Buat kiriman. */
export default async function CourierSettingsPage() {
  const principal = await requireTenantAdmin();
  const disabled = await withTenantContext(db, principal.userId, principal.tenantId, loadTenantDisabledCouriers, STORE_SETUP);
  return <CourierPreferences disabled={disabled} />;
}
