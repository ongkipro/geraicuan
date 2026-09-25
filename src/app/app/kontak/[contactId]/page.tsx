import { Archive, CircleAlert, ContactRound, MapPin, PackagePlus, Plus } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AlertRegion } from "@/app/_components/alert-region";
import { FocusRegion } from "@/app/app/focus-region";
import { ArchiveConfirmationForm, ArchiveHashFocus, ContactAddressForm, ContactDetailsForm, ContactRolesForm } from "@/app/app/kontak/[contactId]/contact-detail-forms";
import { CopyPhoneButton, WhatsAppLink } from "@/app/app/kontak/contact-ui";
import { BackLink } from "@/components/cms/back-link";
import { DetailLayout, PageAside } from "@/components/cms/cms-layouts";
import { DefinitionGrid } from "@/components/cms/detail-section";
import { EmptyState } from "@/components/cms/empty-state";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { ToneBadge } from "@/components/cms/shipment-status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getContact, listContactAddresses } from "@/db/contact-repository";
import { db } from "@/db/client";
import { listReadyShipmentOutlets } from "@/db/outlet-readiness-repository";
import { withTenantContext } from "@/db/tenant-context";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { contactListHref, contactRoleFor, contactRoleLabel, DEFAULT_CONTACT_ROLE, parseContactRole, type ContactRole } from "@/lib/contact-role-filter";
import { areaDisplayCase, formatWibDateTime } from "@/lib/label-format";
import { parseUiAuditScenarioForRoute, UI_AUDIT_HEADER } from "@/lib/ui-audit-scenario";

// The contact name stays out of the document title (browser history, shared screens).
export const metadata: Metadata = { title: "Detail kontak · GeraiCUAN", robots: { index: false } };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type SearchValue = string | string[] | undefined;
type ContactDetailPageProps = {
  params: Promise<{ contactId: string }>;
  searchParams: Promise<{ alamat?: SearchValue; arsipkan?: SearchValue; dari?: SearchValue; diarsipkan?: SearchValue }>;
};

function firstValue(value: SearchValue) {
  return Array.isArray(value) ? value[0] : value;
}

function ContactNotFound({ role }: { role: ContactRole }) {
  const noun = contactRoleLabel(role).toLowerCase();
  return <PageContainer><PageHeader description="Kontak mungkin sudah dihapus atau bukan milik tenant aktif." eyebrow="Data" title="Kontak tidak ditemukan" /><EmptyState action={<Button asChild className="min-h-11"><Link href={contactListHref(role)}>Kembali ke daftar {noun}</Link></Button>} description={`Buka daftar ${noun} untuk memilih kontak yang masih tersedia.`} icon={ContactRound} title="Detail kontak tidak tersedia" /></PageContainer>;
}

async function requireTenantPrincipal() {
  try {
    const principal = await requireCmsScope("tenant");
    if (principal.scope !== "tenant") redirect("/login/tenant");
    return principal;
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) redirect("/login/tenant");
    throw error;
  }
}

export default async function ContactDetailPage({ params, searchParams }: ContactDetailPageProps) {
  const principal = await requireTenantPrincipal();
  const { contactId } = await params;
  const auditScenario = process.env.NODE_ENV === "development"
    ? parseUiAuditScenarioForRoute((await headers()).get(UI_AUDIT_HEADER), "/app/kontak/[contactId]")
    : null;
  if (auditScenario === "contact-detail-route-error") throw new Error("Intentional development-only contact detail failure.");
  const detail = UUID_PATTERN.test(contactId)
    ? await withTenantContext(db, principal.userId, principal.tenantId, async (tx, context) => {
        const item = await getContact(tx, context, contactId);
        if (!item) return null;
        const addresses = await listContactAddresses(tx, context, contactId);
        // Outlet readiness is a separate lookup from the contact's own data:
        // a failure there degrades the address form's destination picker
        // without making the rest of the page unusable, so it is caught
        // rather than allowed to fail the whole page like a missing contact.
        let outlets: Awaited<ReturnType<typeof listReadyShipmentOutlets>> = [];
        let outletsUnavailable = false;
        if (auditScenario === "contact-detail-outlet-error") {
          outletsUnavailable = true;
        } else {
          try {
            outlets = await listReadyShipmentOutlets(tx, context);
          } catch {
            outletsUnavailable = true;
          }
        }
        return { addresses, item, outlets, outletsUnavailable };
      })
    : null;
  const query = await searchParams;
  // T-188: `dari` names the menu (Pengirim or Penerima) the contact was opened
  // from, so the back link and the sidebar's current item agree. A URL without
  // one is canonicalised to the contact's first role, keeping every other key.
  const requestedRole = parseContactRole(firstValue(query.dari));
  if (!detail) return <ContactNotFound role={requestedRole ?? DEFAULT_CONTACT_ROLE} />;
  if (!requestedRole) {
    const canonical = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      const first = firstValue(value);
      if (key !== "dari" && first !== undefined) canonical.set(key, first);
    }
    canonical.set("dari", contactRoleFor(detail.item, null));
    redirect(`/app/kontak/${contactId}?${canonical.toString()}`);
  }
  const role = requestedRole;

  const activeAddresses = detail.addresses.filter((address) => !address.archivedAt);
  const selectedAddress = activeAddresses.find((address) => address.id === firstValue(query.alamat));
  const archiveConfirmation = firstValue(query.arsipkan) === "1" && principal.role === "TENANT_ADMIN" && !detail.item.archivedAt;
  const archivedSuccess = firstValue(query.diarsipkan) === "1" && Boolean(detail.item.archivedAt);

  const archived = Boolean(detail.item.archivedAt);
  const isAdmin = principal.role === "TENANT_ADMIN";
  const roleChip = (held: boolean, chipRole: ContactRole) => held
    ? <Badge variant={chipRole === role ? "secondary" : "outline"}>{contactRoleLabel(chipRole)}</Badge>
    : null;

  return (
    <PageContainer>
      <ArchiveHashFocus />
      {/* T-188: back to the menu the contact was opened from. T-206 (owner reference kontak-detail.html):
          a text link above the eyebrow; the header actions are the contact's own — WhatsApp, copy, use. */}
      <div className="grid gap-1">
      <BackLink href={contactListHref(role)}>Kembali ke daftar {contactRoleLabel(role).toLowerCase()}</BackLink>
      <PageHeader
        actions={(
          <>
            <WhatsAppLink name={detail.item.name} phone={detail.item.phone} showLabel />
            <CopyPhoneButton label="Salin nomor" name={detail.item.name} phone={detail.item.phone} showLabel />
            {!archived ? <Button asChild className="max-md:w-full"><Link href="/app/pengiriman/baru"><PackagePlus aria-hidden="true" />Pakai di kiriman baru</Link></Button> : null}
          </>
        )}
        description={(
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {roleChip(detail.item.isSender, "pengirim")}
            {roleChip(detail.item.isRecipient, "penerima")}
            {archived ? <ToneBadge label="Diarsipkan" tone="neutral" /> : <ToneBadge label="Aktif" tone="ok" />}
          </div>
        )}
        eyebrow="Data"
        title={<span className="block max-w-full wrap-anywhere">{detail.item.name}</span>}
      />
      </div>

      {archivedSuccess ? <FocusRegion className="rounded-lg" role="status"><Alert role="presentation"><Archive aria-hidden="true" /><AlertTitle>Kontak diarsipkan</AlertTitle><AlertDescription>Kontak tidak lagi tersedia pada pemilih draf baru.</AlertDescription></Alert></FocusRegion> : archived ? <Alert role="status"><Archive aria-hidden="true" /><AlertTitle>Kontak ini diarsipkan</AlertTitle><AlertDescription>Data tetap dapat dibaca untuk riwayat, tetapi tidak dapat diubah atau dipilih pada draf baru.</AlertDescription></Alert> : null}

      <DetailLayout
        aside={(
          <PageAside label="Ringkasan kontak">
            <Card>
              <CardHeader className="border-b"><CardTitle>Ringkasan</CardTitle></CardHeader>
              <CardContent>
                <dl className="grid gap-3 text-sm">
                  <div className="flex items-baseline justify-between gap-3"><dt className="text-muted-foreground">Alamat aktif</dt><dd className="font-semibold tabular-nums">{activeAddresses.length} alamat</dd></div>
                  <div className="flex items-baseline justify-between gap-3 border-t pt-3"><dt className="text-muted-foreground">Terakhir diperbarui</dt><dd className="text-right">{formatWibDateTime(detail.item.updatedAt)}</dd></div>
                </dl>
              </CardContent>
            </Card>
          </PageAside>
        )}
      >
        {archived ? (
          <Card>
            <CardHeader className="border-b"><CardTitle>Kontak</CardTitle><CardDescription>Data kontak diarsipkan; hanya dapat dibaca.</CardDescription></CardHeader>
            <CardContent className="grid gap-4">
              <DefinitionGrid items={[{ label: "Nama", value: <span className="wrap-anywhere">{detail.item.name}</span> }, { label: "Nomor telepon", value: <span className="wrap-anywhere tabular-nums">{detail.item.phone}</span> }]} />
            </CardContent>
          </Card>
        ) : (
          <>
            <ContactDetailsForm contact={{ id: detail.item.id, isRecipient: detail.item.isRecipient, isSender: detail.item.isSender, name: detail.item.name, phone: detail.item.phone }} />
            <ContactRolesForm contact={{ id: detail.item.id, isRecipient: detail.item.isRecipient, isSender: detail.item.isSender, name: detail.item.name, phone: detail.item.phone }} />
          </>
        )}

        <Card>
          <CardHeader className="border-b"><CardTitle className="flex items-center gap-2" id="alamat-heading"><MapPin aria-hidden="true" className="size-4 text-muted-foreground" />Daftar alamat</CardTitle><CardDescription>{activeAddresses.length} dari maksimal 20 alamat aktif.</CardDescription>{!archived && !selectedAddress && activeAddresses.length < 20 ? <CardAction className="self-center"><a className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline md:min-h-8" href="#alamat-baru"><Plus aria-hidden="true" className="size-4" />Tambah alamat</a></CardAction> : null}</CardHeader>
          <CardContent className="grid min-w-0 gap-6">
            {activeAddresses.length > 0 ? <ul className="grid min-w-0 divide-y" id="alamat">{activeAddresses.map((address) => <li className="flex min-w-0 flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between" key={address.id}><div className="grid min-w-0 gap-1.5"><div className="flex min-w-0 flex-wrap items-center gap-2"><strong className="wrap-anywhere font-medium">{address.label}</strong>{address.isPrimary ? <Badge variant="secondary">Alamat utama</Badge> : null}</div><p className="wrap-anywhere text-sm leading-6">{areaDisplayCase(address.address)}</p><p className="wrap-anywhere text-sm text-muted-foreground">{address.destinationAreaLabel ? `Area: ${areaDisplayCase(address.destinationAreaLabel)}` : "Area belum dipilih"}</p></div>{!detail.item.archivedAt ? <Button asChild className="min-h-11 shrink-0 max-md:w-full md:min-h-10" size="sm" variant="outline"><Link href={`/app/kontak/${contactId}?dari=${role}&alamat=${address.id}#alamat-edit`}>Edit alamat</Link></Button> : null}</li>)}</ul> : <p className="text-sm text-muted-foreground" id="alamat" role="status">Belum ada alamat aktif.</p>}
            {detail.outletsUnavailable ? <Alert role="alert" variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>Pemilihan outlet tidak tersedia</AlertTitle><AlertDescription>Daftar outlet gagal dimuat. Alamat dapat tetap dibaca dan diedit, tetapi area tujuan baru tidak dapat dipilih sampai outlet tersedia kembali.</AlertDescription></Alert> : null}
            {!detail.item.archivedAt && selectedAddress ? <><Separator /><div className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" id="alamat-edit" tabIndex={-1}><ContactAddressForm address={selectedAddress} contactId={detail.item.id} outlets={detail.outlets} /></div></> : null}
            {!detail.item.archivedAt && !selectedAddress && activeAddresses.length < 20 ? <><Separator /><ContactAddressForm contactId={detail.item.id} outlets={detail.outlets} /></> : !selectedAddress ? <Alert role="status"><AlertTitle>{detail.item.archivedAt ? "Alamat baru dinonaktifkan" : "Batas alamat tercapai"}</AlertTitle><AlertDescription>{detail.item.archivedAt ? "Kontak diarsipkan tidak dapat menerima alamat baru." : "Batas 20 alamat aktif per kontak sudah tercapai."}</AlertDescription></Alert> : null}
          </CardContent>
        </Card>
        {/* Spec 10 §5 detail pattern (T-206 reference): the danger zone closes the main column. */}
        <Card className="border-destructive/30">
          <CardHeader className="border-b"><CardTitle className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" id="arsip-heading" tabIndex={-1}>Zona hati-hati</CardTitle><CardDescription>Data kontak pada kiriman lama tetap tersimpan setelah kontak diarsipkan.</CardDescription></CardHeader>
          <CardContent>{archived ? <p className="text-sm text-muted-foreground" role="status">Kontak ini sudah diarsipkan.</p> : !isAdmin ? <p className="text-sm text-muted-foreground" role="status">Arsip kontak dikelola oleh Tenant Admin.</p> : archiveConfirmation ? <AlertRegion className="rounded-lg" id="arsip-kontak"><Alert role="presentation" variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>Arsipkan {detail.item.name}?</AlertTitle><AlertDescription className="grid gap-4"><p>Kontak tidak lagi muncul saat memilih pengirim atau penerima. Kiriman lama tetap menyimpan snapshot; retensi kontak mengikuti kebijakan sistem.</p><ArchiveConfirmationForm contactId={detail.item.id} role={role} /></AlertDescription></Alert></AlertRegion> : <div className="grid gap-3" id="arsip-kontak"><p className="text-sm text-muted-foreground">Arsipkan untuk menyembunyikan kontak dari pemilih draf.</p><Button asChild className="min-h-11 w-fit md:min-h-10" size="sm" variant="outline"><Link href={`/app/kontak/${contactId}?dari=${role}&arsipkan=1#arsip-kontak`}><Archive aria-hidden="true" />Arsipkan kontak</Link></Button></div>}</CardContent>
        </Card>
      </DetailLayout>
    </PageContainer>
  );
}
