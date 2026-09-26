import type { Metadata } from "next";

import { db } from "@/db/client";
import { withTenantContext } from "@/db/tenant-context";
import { loadTenantLabelFields, loadTenantProfile } from "@/db/tenant-settings-repository";

import { requireTenantAdmin, STORE_SETUP } from "../_components/settings-data";
import { LabelInfoEditor } from "./label-info-editor";

export const metadata: Metadata = { title: "Informasi label · Pengaturan", robots: { index: false } };

/** PR-86: which fields the thermal label prints, per size, with a live preview of the real sheet. */
export default async function LabelInfoSettingsPage() {
  const principal = await requireTenantAdmin();
  const { fields, profile } = await withTenantContext(
    db,
    principal.userId,
    principal.tenantId,
    async (tx, context) => ({
      fields: await loadTenantLabelFields(tx, context),
      profile: await loadTenantProfile(tx, context),
    }),
    STORE_SETUP,
  );

  return <LabelInfoEditor geraiName={profile.name} geraiWhatsapp={profile.contactWhatsapp} initial={fields} />;
}
