import type { Metadata } from "next";
import { headers } from "next/headers";

import {
  ContactRoleDirectory,
  type ContactRoleDirectorySearchParams,
  requireContactDirectoryPrincipal,
} from "@/app/app/kontak/contact-role-directory";
import { parseUiAuditScenarioForRoute, UI_AUDIT_HEADER } from "@/lib/ui-audit-scenario";

export const metadata: Metadata = { robots: { index: false } };

// T-188: the Penerima menu — the contact directory scoped to contacts.is_recipient.
export default async function RecipientDirectoryPage({ searchParams }: { searchParams: ContactRoleDirectorySearchParams }) {
  const principal = await requireContactDirectoryPrincipal();
  const auditScenario = process.env.NODE_ENV === "development"
    ? parseUiAuditScenarioForRoute((await headers()).get(UI_AUDIT_HEADER), "/app/kontak/penerima")
    : null;
  if (auditScenario === "contacts-recipient-error") throw new Error("Intentional development-only penerima directory failure.");

  return ContactRoleDirectory({ principal, role: "penerima", searchParams, stream: auditScenario === "contacts-recipient-stream" });
}
