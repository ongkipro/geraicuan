import type { ReactNode } from "react";

import { PageHeader } from "@/components/app/page-header";

import { requireTenantAdmin } from "./_components/settings-data";
import { SettingsFrame } from "./_components/settings-frame";

/**
 * One frame for Profil gerai, Informasi label, Titik pickup, Outlet, Mitra kurir and Koneksi Mengantar, so the sub-menu stays
 * while a page loads or fails. Tenant Admin only: an Operator never sees the frame, and every
 * page and Server Action checks again.
 */
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  await requireTenantAdmin();
  return (
    <SettingsFrame
      header={(
        <PageHeader
          eyebrow="Pengelolaan"
          title="Pengaturan"
        />
      )}
    >
      {children}
    </SettingsFrame>
  );
}
