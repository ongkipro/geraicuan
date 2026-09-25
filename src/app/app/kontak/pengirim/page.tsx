import type { Metadata } from "next";
import { headers } from "next/headers";

import {
  ContactRoleDirectory,
  type ContactRoleDirectorySearchParams,
  requireContactDirectoryPrincipal,
} from "@/app/app/kontak/contact-role-directory";
import { parseUiAuditScenarioForRoute, UI_AUDIT_HEADER } from "@/lib/ui-audit-scenario";

export const metadata: Metadata = { robots: { index: false } };

// T-188: the Pengirim menu — the contact directory scoped to contacts.is_sender.
export default async function SenderDirectoryPage({ searchParams }: { searchParams: ContactRoleDirectorySearchParams }) {
  const principal = await requireContactDirectoryPrincipal();
  const auditScenario = process.env.NODE_ENV === "development"
    ? parseUiAuditScenarioForRoute((await headers()).get(UI_AUDIT_HEADER), "/app/kontak/pengirim")
    : null;
  if (auditScenario === "contacts-sender-error") throw new Error("Intentional development-only pengirim directory failure.");

  return ContactRoleDirectory({ principal, role: "pengirim", searchParams, stream: auditScenario === "contacts-sender-stream" });
}
