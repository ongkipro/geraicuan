import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { firstValue } from "@/app/app/kontak/contact-directory-query";
import { requireContactPagePrincipal } from "@/app/app/kontak/contact-page-guard";
import { db } from "@/db/client";
import { getContact } from "@/db/contact-repository";
import { withTenantContext } from "@/db/tenant-context";
import { contactDetailHref, contactRoleFor, parseContactRole } from "@/lib/contact-role-filter";

export const metadata: Metadata = { robots: { index: false }, title: "Detail kontak" };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SearchValue = string | string[] | undefined;

/**
 * T-241: the pre-T-241 detail URL `/app/kontak/<uuid>?dari=<peran>` permanently redirects to
 * `/app/kontak/<peran>/<n>`. The UUID resolves only inside the signed-in tenant (the table's own
 * `tenant_id` predicate), so another tenant's id, an unknown id and a malformed one all read
 * "Kontak tidak ditemukan". `dari` keeps the menu when the contact still holds that role.
 */
export default async function LegacyContactDetailPage({ params, searchParams }: {
  params: Promise<{ contactId: string }>;
  searchParams: Promise<{ dari?: SearchValue }>;
}) {
  const principal = await requireContactPagePrincipal();
  const { contactId } = await params;
  if (!UUID_PATTERN.test(contactId)) notFound();
  const contact = await withTenantContext(db, principal.userId, principal.tenantId, (tx, context) =>
    getContact(tx, context, contactId),
  );
  if (!contact) notFound();
  const role = contactRoleFor(contact, parseContactRole(firstValue((await searchParams).dari)));
  permanentRedirect(contactDetailHref(contact.contactNumber, role));
}
