import { Archive, CircleAlert, ContactRound, MapPin } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AlertRegion } from "@/app/_components/alert-region";
import { FocusRegion } from "@/app/app/focus-region";
import { ArchiveConfirmationForm, ArchiveHashFocus, ContactAddressForm, ContactIdentityForm } from "@/app/app/kontak/[contactId]/contact-detail-forms";
import { EmptyState } from "@/components/cms/empty-state";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getContact, listContactAddresses } from "@/db/contact-repository";
import { db } from "@/db/client";
import { listReadyShipmentOutlets } from "@/db/outlet-readiness-repository";
import { withTenantContext } from "@/db/tenant-context";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { parseUiAuditScenarioForRoute, UI_AUDIT_HEADER } from "@/lib/ui-audit-scenario";

export const metadata: Metadata = { robots: { index: false } };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type SearchValue = string | string[] | undefined;
type ContactDetailPageProps = {
  params: Promise<{ contactId: string }>;
  searchParams: Promise<{ alamat?: SearchValue; arsipkan?: SearchValue; diarsipkan?: SearchValue }>;
};

function firstValue(value: SearchValue) {
  return Array.isArray(value) ? value[0] : value;
}

function ContactNotFound() {
  return <PageContainer width="form"><PageHeader description="Kontak mungkin sudah dihapus atau bukan milik tenant aktif." eyebrow="Kontak" title="Kontak tidak ditemukan" /><EmptyState action={<Button asChild className="min-h-11"><Link href="/app/kontak">Kembali ke direktori</Link></Button>} description="Buka direktori untuk memilih kontak yang masih tersedia." icon={ContactRound} title="Detail kontak tidak tersedia" /></PageContainer>;
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
  if (!detail) return <ContactNotFound />;

  const query = await searchParams;
  const activeAddresses = detail.addresses.filter((address) => !address.archivedAt);
  const selectedAddress = activeAddresses.find((address) => address.id === firstValue(query.alamat));
  const archiveConfirmation = firstValue(query.arsipkan) === "1" && principal.role === "TENANT_ADMIN" && !detail.item.archivedAt;
  const archivedSuccess = firstValue(query.diarsipkan) === "1" && Boolean(detail.item.archivedAt);

  return (
    <PageContainer width="form">
      <ArchiveHashFocus />
      <PageHeader actions={<Button asChild className="max-sm:w-full" variant="outline"><Link href="/app/kontak">Kembali ke direktori</Link></Button>} description={<div className="flex flex-wrap gap-1.5">{detail.item.isSender ? <Badge variant="secondary">Pengirim</Badge> : null}{detail.item.isRecipient ? <Badge variant="outline">Penerima</Badge> : null}{detail.item.archivedAt ? <Badge variant="outline">Diarsipkan</Badge> : null}</div>} eyebrow="Kontak" title={<span className="block max-w-full wrap-anywhere">{detail.item.name}</span>} />

      {archivedSuccess ? <FocusRegion className="rounded-lg" role="status"><Alert role="presentation"><Archive aria-hidden="true" /><AlertTitle>Kontak diarsipkan</AlertTitle><AlertDescription>Kontak tidak lagi tersedia pada pemilih draf baru.</AlertDescription></Alert></FocusRegion> : null}

      {detail.item.archivedAt ? (
        <Card className="shadow-none"><CardHeader className="border-b"><CardTitle>Data kontak diarsipkan</CardTitle><CardDescription>Data tetap dapat dibaca untuk konteks, tetapi tidak dapat diubah atau dipakai pada draf baru.</CardDescription></CardHeader><CardContent><dl className="grid min-w-0 gap-4 text-sm sm:grid-cols-2"><div className="min-w-0"><dt className="text-muted-foreground">Nama</dt><dd className="mt-1 wrap-anywhere font-medium">{detail.item.name}</dd></div><div className="min-w-0"><dt className="text-muted-foreground">Nomor telepon</dt><dd className="mt-1 wrap-anywhere font-medium">{detail.item.phone}</dd></div></dl></CardContent></Card>
      ) : <ContactIdentityForm contact={{ id: detail.item.id, isRecipient: detail.item.isRecipient, isSender: detail.item.isSender, name: detail.item.name, phone: detail.item.phone }} />}

      <Card className="shadow-none">
        <CardHeader className="border-b"><CardTitle className="flex items-center gap-2" id="alamat-heading"><MapPin aria-hidden="true" className="size-4" />Alamat</CardTitle><CardDescription>{activeAddresses.length} dari maksimal 20 alamat aktif.</CardDescription></CardHeader>
        <CardContent className="grid min-w-0 gap-6">
          {activeAddresses.length > 0 ? <ul className="min-w-0 divide-y" id="alamat">{activeAddresses.map((address) => <li className="grid min-w-0 gap-2 py-4 first:pt-0 last:pb-0" key={address.id}><div className="flex min-w-0 flex-wrap items-center gap-2"><strong className="wrap-anywhere">{address.label}</strong>{address.isPrimary ? <Badge variant="secondary">Alamat utama</Badge> : null}</div><p className="wrap-anywhere text-sm leading-6">{address.address}</p><p className="wrap-anywhere text-sm text-muted-foreground">{address.destinationAreaLabel ? `Area: ${address.destinationAreaLabel}` : "Area belum dipilih"}</p>{!detail.item.archivedAt ? <Button asChild className="min-h-11 justify-self-start" size="sm" variant="outline"><Link href={`/app/kontak/${contactId}?alamat=${address.id}#alamat-edit`}>Edit alamat</Link></Button> : null}</li>)}</ul> : <p className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground" id="alamat" role="status">Belum ada alamat aktif.</p>}
          {detail.outletsUnavailable ? <Alert role="alert" variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>Pemilihan outlet tidak tersedia</AlertTitle><AlertDescription>Daftar outlet gagal dimuat. Alamat dapat tetap dibaca dan diedit, tetapi area tujuan baru tidak dapat dipilih sampai outlet tersedia kembali.</AlertDescription></Alert> : null}
          {!detail.item.archivedAt && selectedAddress ? <><Separator /><div className="rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50" id="alamat-edit" tabIndex={-1}><ContactAddressForm address={selectedAddress} contactId={detail.item.id} outlets={detail.outlets} /></div></> : null}
          {!detail.item.archivedAt && !selectedAddress && activeAddresses.length < 20 ? <><Separator /><ContactAddressForm contactId={detail.item.id} outlets={detail.outlets} /></> : !selectedAddress ? <Alert role="status"><AlertTitle>{detail.item.archivedAt ? "Alamat baru dinonaktifkan" : "Batas alamat tercapai"}</AlertTitle><AlertDescription>{detail.item.archivedAt ? "Kontak diarsipkan tidak dapat menerima alamat baru." : "Batas 20 alamat aktif per kontak sudah tercapai."}</AlertDescription></Alert> : null}
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader className="border-b"><CardTitle className="rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50" id="arsip-heading" tabIndex={-1}>Arsip kontak</CardTitle><CardDescription>Kiriman lama tetap menyimpan snapshot kontak setelah kontak diarsipkan.</CardDescription></CardHeader>
        <CardContent>{detail.item.archivedAt ? <p className="text-sm text-muted-foreground" role="status">Kontak ini sudah diarsipkan.</p> : principal.role !== "TENANT_ADMIN" ? <p className="text-sm text-muted-foreground" role="status">Arsip kontak dikelola oleh Tenant Admin.</p> : archiveConfirmation ? <AlertRegion className="rounded-lg" id="arsip-kontak"><Alert role="presentation" variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>Arsipkan {detail.item.name}?</AlertTitle><AlertDescription className="grid gap-4"><p>Kontak tidak lagi muncul saat memilih pengirim atau penerima. Kiriman lama tetap menyimpan snapshot; retensi kontak mengikuti kebijakan sistem.</p><ArchiveConfirmationForm contactId={detail.item.id} /></AlertDescription></Alert></AlertRegion> : <Button asChild className="min-h-11" variant="destructive"><Link href={`/app/kontak/${contactId}?arsipkan=1#arsip-kontak`}>Arsipkan kontak</Link></Button>}</CardContent>
      </Card>
    </PageContainer>
  );
}
