import { Archive, ArrowLeft, CheckCircle2, PackagePlus } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  ContactAddressesCard,
  ContactArchiveZone,
  ContactIdentityCard,
  ContactRolesCard,
} from "@/app/app/kontak/[contactId]/contact-detail-cards";
import { firstValue } from "@/app/app/kontak/contact-directory-query";
import { requireContactPagePrincipal } from "@/app/app/kontak/contact-page-guard";
import { CopyPhoneButton, WhatsAppButton } from "@/app/app/kontak/contact-quick-actions";
import { DataCard } from "@/components/app/data-card";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { db } from "@/db/client";
import { getContact, listContactAddresses } from "@/db/contact-repository";
import { listReadyShipmentOutlets } from "@/db/outlet-readiness-repository";
import { withTenantContext } from "@/db/tenant-context";
import { contactListHref, contactRoleFor, contactRoleLabel, parseContactRole } from "@/lib/contact-role-filter";
import { formatWibDateTime } from "@/lib/label-format";
import { parseUiAuditScenarioForRoute, UI_AUDIT_HEADER } from "@/lib/ui-audit-scenario";

// The contact's name stays out of the document title (browser history, shared screens).
export const metadata: Metadata = { robots: { index: false }, title: "Detail kontak" };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SearchValue = string | string[] | undefined;
type ContactDetailProps = {
  params: Promise<{ contactId: string }>;
  searchParams: Promise<{ dari?: SearchValue; diarsipkan?: SearchValue; tersimpan?: SearchValue }>;
};

/**
 * Spec 17 `/app/kontak/[id]` (ref kontak-detail.html): back link → header (name, status and role
 * badges; WhatsApp, Salin nomor, Pakai di kiriman baru) → cards Kontak · Peran · Alamat → danger zone
 * (Tenant Admin: `archiveContact` refuses anyone else) · rail Ringkasan.
 */
export default async function ContactDetailPage({ params, searchParams }: ContactDetailProps) {
  const principal = await requireContactPagePrincipal();
  const { contactId } = await params;
  const scenario = process.env.NODE_ENV === "development"
    ? parseUiAuditScenarioForRoute((await headers()).get(UI_AUDIT_HEADER), "/app/kontak/[contactId]")
    : null;
  if (scenario === "contact-detail-route-error") throw new Error("Intentional development-only contact detail failure.");
  if (!UUID_PATTERN.test(contactId)) notFound();

  const detail = await withTenantContext(db, principal.userId, principal.tenantId, async (tx, context) => {
    const contact = await getContact(tx, context, contactId);
    if (!contact) return null;
    const addresses = await listContactAddresses(tx, context, contactId);
    // Outlets only feed the kecamatan search; their failure must not take the contact down.
    let outlets: Awaited<ReturnType<typeof listReadyShipmentOutlets>> = [];
    let outletsUnavailable = scenario === "contact-detail-outlet-error";
    if (!outletsUnavailable) {
      try {
        outlets = await listReadyShipmentOutlets(tx, context);
      } catch {
        outletsUnavailable = true;
      }
    }
    return { addresses, contact, outlets, outletsUnavailable };
  });
  if (!detail) notFound();

  const query = await searchParams;
  // `dari` names the menu the contact was opened from, so the back link and the current sidebar
  // item agree; a URL without it is canonicalised to the contact's first role (T-188).
  const role = parseContactRole(firstValue(query.dari));
  if (!role) redirect(`/app/kontak/${contactId}?dari=${contactRoleFor(detail.contact, null)}`);

  const { contact } = detail;
  const archived = Boolean(contact.archivedAt);
  const isAdmin = principal.role === "TENANT_ADMIN";
  const activeAddresses = detail.addresses.filter((address) => !address.archivedAt);
  const identity = { id: contact.id, isRecipient: contact.isRecipient, isSender: contact.isSender, name: contact.name, phone: contact.phone };
  const roles = [contact.isSender ? "Pengirim" : null, contact.isRecipient ? "Penerima" : null].filter(Boolean).join(" · ");

  return (
    <>
      <PageHeader
        actions={(
          <>
            <WhatsAppButton labelled name={contact.name} phone={contact.phone} />
            <CopyPhoneButton labelled name={contact.name} phone={contact.phone} />
            {archived ? null : (
              <Button asChild>
                <Link href="/app/pengiriman/baru"><PackagePlus aria-hidden="true" />Pakai di kiriman baru</Link>
              </Button>
            )}
          </>
        )}
        back={(
          <Link className="inline-flex min-h-6 items-center gap-1.5 text-sm font-semibold text-primary underline-offset-4 hover:underline" href={contactListHref(role)}>
            <ArrowLeft aria-hidden="true" className="size-4" />Kembali ke daftar {contactRoleLabel(role).toLowerCase()}
          </Link>
        )}
        description={(
          <span className="flex flex-wrap items-center gap-2 pt-1">
            {archived ? <StatusBadge label="Diarsipkan" tone="neutral" /> : <StatusBadge label="Aktif" tone="success" />}
            {contact.isSender ? <Badge variant="outline">Pengirim</Badge> : null}
            {contact.isRecipient ? <Badge variant="outline">Penerima</Badge> : null}
          </span>
        )}
        eyebrow="Data"
        title={<span className="wrap-anywhere">{contact.name}</span>}
      />

      {firstValue(query.tersimpan) === "1" && !archived ? (
        <Alert role="status">
          <CheckCircle2 aria-hidden="true" />
          <AlertTitle>Kontak tersimpan</AlertTitle>
          <AlertDescription>Kontak siap dipilih saat membuat kiriman.</AlertDescription>
        </Alert>
      ) : null}
      {archived ? (
        <Alert role="status">
          <Archive aria-hidden="true" />
          <AlertTitle>{firstValue(query.diarsipkan) === "1" ? "Kontak diarsipkan" : "Kontak ini diarsipkan"}</AlertTitle>
          <AlertDescription>Data tetap tersimpan untuk riwayat, tetapi tidak dapat diubah atau dipilih di kiriman baru.</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          {archived ? (
            <DataCard title="Kontak">
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <div className="grid gap-0.5"><dt className="text-xs text-muted-foreground">Nama lengkap</dt><dd className="font-semibold wrap-anywhere">{contact.name}</dd></div>
                <div className="grid gap-0.5"><dt className="text-xs text-muted-foreground">Nomor telepon</dt><dd className="font-semibold tabular-nums">{contact.phone}</dd></div>
              </dl>
            </DataCard>
          ) : (
            <>
              <ContactIdentityCard contact={identity} />
              <ContactRolesCard contact={identity} />
            </>
          )}
          <ContactAddressesCard
            addresses={activeAddresses}
            archived={archived}
            canManageSettings={isAdmin}
            contact={identity}
            outlets={detail.outlets}
            outletsUnavailable={detail.outletsUnavailable}
          />
          {!archived && isAdmin ? <ContactArchiveZone contact={identity} role={role} /> : null}
        </div>
        <aside aria-label="Ringkasan kontak">
          <DataCard title="Ringkasan">
            <dl className="grid divide-y text-sm">
              <div className="flex items-baseline justify-between gap-3 pb-3"><dt className="text-muted-foreground">Peran</dt><dd className="text-right font-medium">{roles}</dd></div>
              <div className="flex items-baseline justify-between gap-3 py-3"><dt className="text-muted-foreground">Alamat aktif</dt><dd className="font-semibold tabular-nums">{activeAddresses.length} alamat</dd></div>
              <div className="flex items-baseline justify-between gap-3 pt-3"><dt className="text-muted-foreground">Diperbarui</dt><dd className="text-right">{formatWibDateTime(contact.updatedAt)}</dd></div>
            </dl>
          </DataCard>
        </aside>
      </div>
    </>
  );
}
