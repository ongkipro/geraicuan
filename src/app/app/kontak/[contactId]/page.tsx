import { Archive, CircleAlert, ContactRound, MapPin } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AlertRegion } from "@/app/_components/alert-region";
import { FocusRegion } from "@/app/app/focus-region";
import { ArchiveConfirmationForm, ArchiveHashFocus, ContactAddressForm, ContactIdentityForm } from "@/app/app/kontak/[contactId]/contact-detail-forms";
import { DetailLayout, PageAside } from "@/components/cms/cms-layouts";
import { DefinitionGrid } from "@/components/cms/detail-section";
import { EmptyState } from "@/components/cms/empty-state";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getContact, listContactAddresses } from "@/db/contact-repository";
import { db } from "@/db/client";
import { listReadyShipmentOutlets } from "@/db/outlet-readiness-repository";
import { withTenantContext } from "@/db/tenant-context";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { formatWibDateTime } from "@/lib/label-format";
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
  return <PageContainer><PageHeader description="Kontak mungkin sudah dihapus atau bukan milik tenant aktif." eyebrow="Kontak" title="Kontak tidak ditemukan" /><EmptyState action={<Button asChild className="min-h-11"><Link href="/app/kontak">Kembali ke direktori</Link></Button>} description="Buka direktori untuk memilih kontak yang masih tersedia." icon={ContactRound} title="Detail kontak tidak tersedia" /></PageContainer>;
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
    <PageContainer>
      <ArchiveHashFocus />
      <PageHeader actions={<Button asChild className="min-h-11 max-md:w-full md:min-h-8" variant="outline"><Link href="/app/kontak">Kembali ke direktori</Link></Button>} description={<div className="flex flex-wrap gap-1.5">{detail.item.isSender ? <Badge variant="secondary">Pengirim</Badge> : null}{detail.item.isRecipient ? <Badge variant="outline">Penerima</Badge> : null}{detail.item.archivedAt ? <Badge variant="outline">Diarsipkan</Badge> : null}</div>} eyebrow="Kontak" title={<span className="block max-w-full wrap-anywhere">{detail.item.name}</span>} />

      {archivedSuccess ? <FocusRegion className="rounded-lg" role="status"><Alert role="presentation"><Archive aria-hidden="true" /><AlertTitle>Kontak diarsipkan</AlertTitle><AlertDescription>Kontak tidak lagi tersedia pada pemilih draf baru.</AlertDescription></Alert></FocusRegion> : null}

      <DetailLayout
        aside={(
          <PageAside label="Ringkasan kontak">
            <Card>
              <CardHeader>
                <CardTitle>Ringkasan</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm">
                <div className="flex flex-wrap gap-1.5">
                  {detail.item.isSender ? <Badge variant="secondary">Pengirim</Badge> : null}
                  {detail.item.isRecipient ? <Badge variant="outline">Penerima</Badge> : null}
                  <Badge variant={detail.item.archivedAt ? "outline" : "secondary"}>{detail.item.archivedAt ? "Diarsipkan" : "Aktif"}</Badge>
                </div>
                <p className="text-muted-foreground">{activeAddresses.length} alamat tersimpan</p>
              </CardContent>
              <CardFooter className="text-xs text-muted-foreground">
                Terakhir diperbarui {formatWibDateTime(detail.item.updatedAt)}
              </CardFooter>
            </Card>

            {!detail.item.archivedAt ? (
              <Card>
                <CardHeader><CardTitle>Tindakan</CardTitle></CardHeader>
                <CardContent className="grid gap-2">
                  <Button asChild className="min-h-11 w-full"><a href="#form-kontak">Ubah kontak</a></Button>
                  <Button asChild className="min-h-11 w-full" variant="outline"><Link href="/app/pengiriman/baru">Pakai di kiriman baru</Link></Button>
                </CardContent>
              </Card>
            ) : null}

            <Card className="ring-destructive/30">
              <CardHeader><CardTitle className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" id="arsip-heading" tabIndex={-1}>Zona hati-hati</CardTitle><CardDescription>Data kontak pada kiriman lama tetap tersimpan setelah kontak diarsipkan.</CardDescription></CardHeader>
              <CardContent>{detail.item.archivedAt ? <p className="text-sm text-muted-foreground" role="status">Kontak ini sudah diarsipkan.</p> : principal.role !== "TENANT_ADMIN" ? <p className="text-sm text-muted-foreground" role="status">Arsip kontak dikelola oleh Tenant Admin.</p> : archiveConfirmation ? <AlertRegion className="rounded-lg" id="arsip-kontak"><Alert role="presentation" variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>Arsipkan {detail.item.name}?</AlertTitle><AlertDescription className="grid gap-4"><p>Kontak tidak lagi muncul saat memilih pengirim atau penerima. Kiriman lama tetap menyimpan snapshot; retensi kontak mengikuti kebijakan sistem.</p><ArchiveConfirmationForm contactId={detail.item.id} /></AlertDescription></Alert></AlertRegion> : <Button asChild className="min-h-11 max-md:w-full md:min-h-8" variant="destructive"><Link href={`/app/kontak/${contactId}?arsipkan=1#arsip-kontak`}>Arsipkan kontak</Link></Button>}</CardContent>
            </Card>
          </PageAside>
        )}
      >
        {detail.item.archivedAt ? (
          <Card>
            <CardHeader><CardTitle>Data kontak diarsipkan</CardTitle><CardDescription>Data tetap dapat dibaca untuk konteks, tetapi tidak dapat diubah atau dipakai pada draf baru.</CardDescription></CardHeader>
            <CardContent><DefinitionGrid items={[{ label: "Nama", value: <span className="wrap-anywhere">{detail.item.name}</span> }, { label: "Nomor telepon", value: <span className="wrap-anywhere">{detail.item.phone}</span> }]} /></CardContent>
          </Card>
        ) : <ContactIdentityForm contact={{ id: detail.item.id, isRecipient: detail.item.isRecipient, isSender: detail.item.isSender, name: detail.item.name, phone: detail.item.phone }} />}

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2" id="alamat-heading"><MapPin aria-hidden="true" className="size-4 text-muted-foreground" />Alamat</CardTitle><CardDescription>{activeAddresses.length} dari maksimal 20 alamat aktif.</CardDescription></CardHeader>
          <CardContent className="grid min-w-0 gap-6">
            {activeAddresses.length > 0 ? <ul className="grid min-w-0 gap-3" id="alamat">{activeAddresses.map((address) => <li className="flex min-w-0 flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-start sm:justify-between" key={address.id}><div className="grid min-w-0 gap-1.5"><div className="flex min-w-0 flex-wrap items-center gap-2"><strong className="wrap-anywhere font-medium">{address.label}</strong>{address.isPrimary ? <Badge variant="secondary">Alamat utama</Badge> : null}</div><p className="wrap-anywhere text-sm leading-6">{address.address}</p><p className="wrap-anywhere text-sm text-muted-foreground">{address.destinationAreaLabel ? `Area: ${address.destinationAreaLabel}` : "Area belum dipilih"}</p></div>{!detail.item.archivedAt ? <Button asChild className="min-h-11 shrink-0 max-md:w-full md:min-h-8" size="sm" variant="outline"><Link href={`/app/kontak/${contactId}?alamat=${address.id}#alamat-edit`}>Edit alamat</Link></Button> : null}</li>)}</ul> : <p className="rounded-lg border border-dashed bg-muted/40 p-4 text-sm text-muted-foreground" id="alamat" role="status">Belum ada alamat aktif.</p>}
            {detail.outletsUnavailable ? <Alert role="alert" variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>Pemilihan outlet tidak tersedia</AlertTitle><AlertDescription>Daftar outlet gagal dimuat. Alamat dapat tetap dibaca dan diedit, tetapi area tujuan baru tidak dapat dipilih sampai outlet tersedia kembali.</AlertDescription></Alert> : null}
            {!detail.item.archivedAt && selectedAddress ? <><Separator /><div className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" id="alamat-edit" tabIndex={-1}><ContactAddressForm address={selectedAddress} contactId={detail.item.id} outlets={detail.outlets} /></div></> : null}
            {!detail.item.archivedAt && !selectedAddress && activeAddresses.length < 20 ? <><Separator /><ContactAddressForm contactId={detail.item.id} outlets={detail.outlets} /></> : !selectedAddress ? <Alert role="status"><AlertTitle>{detail.item.archivedAt ? "Alamat baru dinonaktifkan" : "Batas alamat tercapai"}</AlertTitle><AlertDescription>{detail.item.archivedAt ? "Kontak diarsipkan tidak dapat menerima alamat baru." : "Batas 20 alamat aktif per kontak sudah tercapai."}</AlertDescription></Alert> : null}
          </CardContent>
        </Card>
      </DetailLayout>
    </PageContainer>
  );
}
