import { Archive, ArrowLeft, Banknote, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, History, Package, PackagePlus, Undo2 } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  ContactAddressesCard,
  ContactArchiveZone,
  ContactDataSection,
} from "@/app/app/kontak/[contactId]/contact-detail-cards";
import {
  contactHistoryHref,
  contactRoleRedirectHref,
  firstValue,
  parseContactHistoryQuery,
  shareText,
  type ContactHistorySearchParams,
} from "@/app/app/kontak/contact-directory-query";
import { requireContactPagePrincipal } from "@/app/app/kontak/contact-page-guard";
import { ContactSection } from "@/app/app/kontak/contact-section";
import { CopyPhoneButton, WhatsAppButton } from "@/app/app/kontak/contact-quick-actions";
import { CourierLogo } from "@/components/app/courier-logo";
import { EmptyState } from "@/components/app/empty-state";
import { KpiCard } from "@/components/app/kpi-card";
import { formatIdr, Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { RecordItem, RecordList } from "@/components/app/record-list";
import { ShipmentStatusBadge, StatusBadge } from "@/components/app/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db/client";
import { getContactByNumber, listContactAddresses } from "@/db/contact-repository";
import {
  loadContactShipmentHistory,
  loadContactShipmentSummary,
  type ContactHistoryPage,
  type ContactHistoryPayment,
} from "@/db/contact-shipment-repository";
import { listReadyShipmentOutlets } from "@/db/outlet-readiness-repository";
import { withTenantContext } from "@/db/tenant-context";
import { contactCategoryLabel } from "@/lib/contact-category";
import {
  contactListHref,
  contactRoleFor,
  contactRoleLabel,
  otherContactRole,
  parseContactNumber,
  type ContactRole,
} from "@/lib/contact-role-filter";
import { areaDisplayCase, formatDistrictCity, formatWibDateTime, formatWibDateTimeParts, parseAreaRegion } from "@/lib/label-format";
import { presentShipmentPayment } from "@/lib/payment-method";
import { shipmentDetailHref } from "@/lib/shipment-number";
import { cn } from "@/lib/utils";
import { parseUiAuditScenarioForRoute, UI_AUDIT_HEADER } from "@/lib/ui-audit-scenario";

const count = new Intl.NumberFormat("id-ID");

const HISTORY_TABS: readonly { label: string; value: ContactHistoryPayment }[] = [
  { label: "Semua", value: "all" },
  { label: "COD", value: "cod" },
  { label: "Non-COD", value: "noncod" },
];

export type ContactDetailProps = {
  params: Promise<{ nomor: string }>;
  searchParams: Promise<ContactHistorySearchParams>;
};

/**
 * T-241 `/app/kontak/pengirim/<n>` and `/app/kontak/penerima/<n>` (ref pengirim-detail.html,
 * penerima-detail.html): back link → header (name, kategori, status, "N alamat terdaftar";
 * WhatsApp line and wilayah of the primary address; WhatsApp, Salin nomor and the one primary
 * "Buat kiriman dari kontak ini") → four KPI cards from GeraiCUAN's own shipments (spec 19 CON-SHP-*;
 * no Mengantar score, D-30) → T-250 two columns: Riwayat kiriman (Semua/COD/Non-COD, 10 per page)
 * and Alamat | Data kontak and the danger zone (Tenant Admin; `archiveContact` refuses anyone else).
 * `<n>` is the per-tenant contact number; name and phone never enter the URL (spec 10 §11).
 */
export async function ContactDetail({ params, role, searchParams }: ContactDetailProps & { role: ContactRole }) {
  const principal = await requireContactPagePrincipal();
  const scenario = process.env.NODE_ENV === "development"
    ? parseUiAuditScenarioForRoute((await headers()).get(UI_AUDIT_HEADER), "/app/kontak/[contactId]")
    : null;
  if (scenario === "contact-detail-route-error") throw new Error("Intentional development-only contact detail failure.");
  const contactNumber = parseContactNumber((await params).nomor);
  if (contactNumber === null) notFound();
  const query = await searchParams;
  const history = parseContactHistoryQuery(query);
  const partyRole = role === "pengirim" ? "SENDER" : "RECIPIENT";

  const detail = await withTenantContext(db, principal.userId, principal.tenantId, async (tx, context) => {
    const contact = await getContactByNumber(tx, context, contactNumber);
    if (!contact) return null;
    // A contact that no longer holds this role is shown under the one it holds (below).
    if (contactRoleFor(contact, role) !== role) return { contact, wrongRole: true as const };
    // In turn, not Promise.all: one transaction, one connection (T-197).
    const addresses = await listContactAddresses(tx, context, contact.id);
    const summary = await loadContactShipmentSummary(tx, context, { contactId: contact.id, role: partyRole });
    const shipments = await loadContactShipmentHistory(tx, context, { contactId: contact.id, page: history.page, payment: history.payment, role: partyRole });
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
    return { addresses, contact, outlets, outletsUnavailable, shipments, summary, wrongRole: false as const };
  });
  if (!detail) notFound();
  if (detail.wrongRole) redirect(contactRoleRedirectHref(detail.contact.contactNumber, otherContactRole(role), query));

  const { contact, summary } = detail;
  const archived = Boolean(contact.archivedAt);
  const isAdmin = principal.role === "TENANT_ADMIN";
  const activeAddresses = detail.addresses.filter((address) => !address.archivedAt);
  const primary = activeAddresses.find((address) => address.isPrimary) ?? activeAddresses[0];
  const region = parseAreaRegion(primary?.destinationAreaLabel);
  const identity = { category: contact.category, id: contact.id, isRecipient: contact.isRecipient, isSender: contact.isSender, name: contact.name, phone: contact.phone };
  const category = contactCategoryLabel(contact.category);
  const label = contactRoleLabel(role);
  const noun = label.toLowerCase();
  const settled = summary.deliveredCount + summary.returnedCount;

  return (
    // T-246 (owner): this page is one white surface — the shell's grey ground turns white while
    // it is shown (`!` beats the unlayered `[data-slot=sidebar-inset]` ground rule); only the KPI
    // row keeps card chrome, with a border so it still reads as cards on white.
    <div className="flex flex-col gap-6 [main:has(&)]:bg-card!" data-surface="white">
      <PageHeader
        actions={(
          <>
            <WhatsAppButton labelled name={contact.name} phone={contact.phone} />
            <CopyPhoneButton labelled name={contact.name} phone={contact.phone} />
            {archived ? null : (
              <Button asChild>
                <Link href="/app/pengiriman/baru"><PackagePlus aria-hidden="true" />Buat kiriman dari kontak ini</Link>
              </Button>
            )}
          </>
        )}
        back={(
          <Link className="inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-primary underline-offset-4 hover:underline md:min-h-6" href={contactListHref(role)}>
            <ArrowLeft aria-hidden="true" className="size-4" />Kembali ke daftar {noun}
          </Link>
        )}
        description={(
          <span className="grid gap-2 pt-1">
            <span className="flex flex-wrap items-center gap-2">
              {category ? <Badge variant="secondary">{category}</Badge> : null}
              {archived ? <StatusBadge label="Diarsipkan" tone="neutral" /> : <StatusBadge label="Aktif" tone="success" />}
              {contact.isSender && contact.isRecipient ? <Badge variant="outline">Pengirim · Penerima</Badge> : null}
              <Badge className="tabular-nums" variant="outline">{count.format(activeAddresses.length)} alamat terdaftar</Badge>
            </span>
            <span>
              WhatsApp <span className="font-medium text-foreground tabular-nums">{contact.phone}</span>
              {region ? <> · Wilayah <span className="font-medium text-foreground">{region.city.name}, {region.province.name}</span></> : null}
            </span>
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

      <section aria-label={`Ringkasan kiriman ${noun}`} className="grid gap-4 *:border sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={Package}
          label="Total kiriman"
          note={summary.shipmentCount > 0 ? `${shareText(summary.deliveredCount, summary.shipmentCount)} terkirim (${count.format(summary.deliveredCount)})` : "Belum ada kiriman"}
          value={summary.shipmentCount}
        />
        <KpiCard
          icon={Banknote}
          label="Nilai COD"
          note={`Dari ${count.format(summary.codOrderCount)} kiriman COD yang resinya terbit`}
          value={formatIdr(summary.codValueIdr)}
        />
        <KpiCard
          icon={Undo2}
          label="Tingkat retur"
          note={settled > 0 ? `${count.format(summary.returnedCount)} retur dari ${count.format(settled)} kiriman selesai` : "Belum ada kiriman selesai"}
          value={shareText(summary.returnedCount, settled) ?? "—"}
        />
        <KpiCard
          icon={CalendarDays}
          label="Kiriman 30 hari terakhir"
          note="Dibuat dalam 30 hari terakhir"
          value={summary.last30DaysCount}
        />
      </section>

      {/*
        T-250 (owner 2026-09-26, "bisa kau buat 2 colum"): below the KPI row, two columns once the
        content column is ≥ 896px (a container query, so a collapsed sidebar counts): the main
        column holds what an operator comes for (Riwayat kiriman, then Alamat); the side column
        (340px, sticky under the top bar when the viewport is tall enough) holds the Data kontak
        form and, last, Zona hati-hati. The DOM follows that desktop reading order; below 896px
        the column wrappers dissolve (`contents`) and `order` stacks Data kontak · Alamat ·
        Riwayat kiriman · Zona hati-hati.
      */}
      <div className="@container/detail">
        <div className="flex flex-col gap-6 @4xl/detail:grid @4xl/detail:grid-cols-[minmax(0,1fr)_340px] @4xl/detail:items-start @4xl/detail:gap-x-12" data-slot="contact-detail-columns">
          <div className="flex min-w-0 flex-col gap-6 @max-4xl/detail:contents" data-column="main">
            <div className="min-w-0 @max-4xl/detail:order-3">
              <ContactHistoryCard contactNumber={contact.contactNumber} history={detail.shipments} payment={history.payment} role={role} />
            </div>
            <div className="min-w-0 @max-4xl/detail:order-2">
              <ContactAddressesCard
                addresses={activeAddresses}
                archived={archived}
                canManageSettings={isAdmin}
                contact={identity}
                outlets={detail.outlets}
                outletsUnavailable={detail.outletsUnavailable}
              />
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-6 @max-4xl/detail:contents [@media(min-height:56rem)]:sticky [@media(min-height:56rem)]:top-24" data-column="side">
            <div className="min-w-0 @max-4xl/detail:order-1">
              {archived ? (
                <ContactSection id="data-kontak" title="Data kontak">
                  <dl className="grid gap-4 text-sm @lg/section:grid-cols-2">
                    <div className="grid gap-0.5"><dt className="text-xs text-muted-foreground">Nama lengkap</dt><dd className="font-semibold wrap-anywhere">{contact.name}</dd></div>
                    <div className="grid gap-0.5"><dt className="text-xs text-muted-foreground">Nomor telepon</dt><dd className="font-semibold tabular-nums">{contact.phone}</dd></div>
                    <div className="grid gap-0.5"><dt className="text-xs text-muted-foreground">Peran / kategori</dt><dd className="font-semibold">{category ?? "Tanpa kategori"}</dd></div>
                    <div className="grid gap-0.5"><dt className="text-xs text-muted-foreground">Diperbarui</dt><dd>{formatWibDateTime(contact.updatedAt)}</dd></div>
                  </dl>
                </ContactSection>
              ) : (
                <ContactDataSection contact={identity} />
              )}
            </div>
            {!archived && isAdmin ? (
              <div className="min-w-0 @max-4xl/detail:order-4">
                <ContactArchiveZone contact={identity} role={role} />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function cityText(areaLabel: string) {
  return areaDisplayCase(formatDistrictCity(areaLabel));
}

/** Ref "Histori paket": the contact's shipments in GeraiCUAN, newest first; tabs are links (URL state, no PII). */
function ContactHistoryCard({ contactNumber, history, payment, role }: {
  contactNumber: number;
  history: ContactHistoryPage;
  payment: ContactHistoryPayment;
  role: ContactRole;
}) {
  const counterpart = role === "pengirim" ? "Penerima" : "Pengirim";
  const total = history.counts[payment];
  return (
    <ContactSection
      count={history.counts.all}
      description={`Kiriman yang ${role === "pengirim" ? "pengirimnya" : "penerimanya"} memakai nomor WhatsApp kontak ini.`}
      id="riwayat-kiriman"
      title="Riwayat kiriman"
    >
      <div>
        <nav aria-label="Jenis pembayaran" className="inline-flex h-10 w-full items-center rounded-lg bg-muted p-1 max-md:h-auto md:w-auto">
          {HISTORY_TABS.map((tab) => {
            const current = tab.value === payment;
            return (
              <Link
                aria-current={current ? "page" : undefined}
                className={cn(
                  "inline-flex h-8 min-w-0 flex-1 items-center justify-center rounded-md px-2 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none max-md:h-11 md:flex-none md:px-4",
                  current && "bg-card text-foreground shadow-sm",
                )}
                href={contactHistoryHref(role, contactNumber, tab.value)}
                key={tab.value}
                scroll={false}
              >
                {tab.label} <span className="ml-1 tabular-nums">({count.format(history.counts[tab.value])})</span>
              </Link>
            );
          })}
        </nav>
      </div>
      {history.rows.length === 0 ? (
        <EmptyState
          description={payment === "all" ? "Kiriman yang memakai nomor ini akan tampil di sini." : "Coba tab lain."}
          icon={History}
          title={payment === "all" ? "Belum ada kiriman" : `Belum ada kiriman ${payment === "cod" ? "COD" : "non-COD"}`}
        />
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <TableCaption className="sr-only">Riwayat kiriman</TableCaption>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-0 whitespace-normal">Resi, ekspedisi &amp; tanggal</TableHead>
                  <TableHead className="px-3 whitespace-normal">{counterpart} &amp; kota tujuan</TableHead>
                  <TableHead className="px-3">Status</TableHead>
                  <TableHead className="pr-0 pl-3 text-right">Pembayaran</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.rows.map((row) => {
                  const date = formatWibDateTimeParts(row.createdAt);
                  const pay = presentShipmentPayment(row);
                  return (
                    <TableRow key={row.shipmentId}>
                      {/* T-250: the date sits under the resi so four columns fit the narrower main column. */}
                      <TableCell className="py-3 pr-3 pl-0 align-top whitespace-normal">
                        <Link className="font-mono font-semibold text-primary underline-offset-4 hover:underline" href={shipmentDetailHref(row.publicReference)}>{row.publicReference}</Link>
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                          {row.providerService ? <CourierLogo className="h-5" courier={row.providerService} /> : null}
                          {row.awb
                            ? <span className="font-mono text-xs break-all text-muted-foreground">{row.awb}</span>
                            : <span className="text-xs text-muted-foreground">Belum ada resi</span>}
                        </span>
                        <time className="mt-1 block text-xs text-muted-foreground tabular-nums" dateTime={row.createdAt.toISOString()}>
                          <span className="whitespace-nowrap">{date.date}</span> · <span className="whitespace-nowrap">{date.time}</span>
                        </time>
                      </TableCell>
                      <TableCell className="px-3 align-top whitespace-normal">
                        <span className="block font-semibold wrap-anywhere">{row.counterpartName}</span>
                        <span className="block text-xs wrap-anywhere text-muted-foreground">{cityText(row.destinationAreaLabel)}</span>
                      </TableCell>
                      <TableCell className="px-3 align-top"><ShipmentStatusBadge status={row.status} /></TableCell>
                      <TableCell className="pr-0 pl-3 text-right align-top">
                        <span className="block text-xs font-medium">{pay.label}</span>
                        <Money amount={pay.amountIdr} className="text-sm font-semibold" />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="md:hidden [&_[data-slot=record-item]]:px-0">
            <RecordList label="Riwayat kiriman">
              {history.rows.map((row) => {
                const pay = presentShipmentPayment(row);
                return (
                  <RecordItem
                    href={shipmentDetailHref(row.publicReference)}
                    key={row.shipmentId}
                    meta={<>{row.awb ? <span className="font-mono">{row.awb}</span> : "Belum ada resi"}</>}
                    status={<ShipmentStatusBadge status={row.status} />}
                    subtitle={<span className="font-semibold">{row.counterpartName} · {cityText(row.destinationAreaLabel)}</span>}
                    time={<time dateTime={row.createdAt.toISOString()}>{formatWibDateTime(row.createdAt)}</time>}
                    title={<span className="font-mono">{row.publicReference}</span>}
                    value={<>{pay.label} {pay.amountIdr === null ? "" : formatIdr(pay.amountIdr)}</>}
                  />
                );
              })}
            </RecordList>
          </div>
        </>
      )}
      {total > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p className="text-sm whitespace-nowrap text-muted-foreground tabular-nums">{count.format(total)} kiriman</p>
            {history.totalPages > 1 ? (
              <nav aria-label="Halaman riwayat kiriman" className="flex items-center gap-2 text-sm">
                <HistoryPageLink disabled={history.page <= 1} href={contactHistoryHref(role, contactNumber, payment, history.page - 1)} label="Sebelumnya">
                  <ChevronLeft aria-hidden="true" />
                </HistoryPageLink>
                <span aria-current="page" className="px-2 whitespace-nowrap tabular-nums">Halaman {history.page} dari {history.totalPages}</span>
                <HistoryPageLink disabled={history.page >= history.totalPages} href={contactHistoryHref(role, contactNumber, payment, history.page + 1)} label="Berikutnya">
                  <ChevronRight aria-hidden="true" />
                </HistoryPageLink>
              </nav>
            ) : null}
        </div>
      ) : null}
    </ContactSection>
  );
}

function HistoryPageLink({ children, disabled, href, label }: { children: React.ReactNode; disabled: boolean; href: string; label: string }) {
  if (disabled) {
    return <Button aria-label={label} disabled size="icon-sm" type="button" variant="outline">{children}</Button>;
  }
  return (
    <Button asChild size="icon-sm" variant="outline">
      <Link aria-label={label} href={href} scroll={false}>{children}</Link>
    </Button>
  );
}
