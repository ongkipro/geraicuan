import type { ReactNode } from "react";

import { requireTenantAdmin } from "@/app/app/pengaturan/_components/settings-data";

/**
 * T-236: guard above `loading.tsx`, so an Operator is redirected before the Pengaturan frame
 * skeleton ("Anggota & akses" and its sub-menu) can render. The page and actions check again.
 */
export default async function MembersLayout({ children }: { children: ReactNode }) {
  await requireTenantAdmin({});
  return children;
}
