"use client";

import { ChevronLeft, ChevronRight, Search, UserRound, X } from "lucide-react";
import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";

import { searchContacts, type ContactSearchRow, type ContactSearchState } from "@/app/app/kontak/actions";
import { contactDirectoryHref } from "@/app/app/kontak/contact-directory-query";
import { CopyPhoneButton, WhatsAppButton } from "@/app/app/kontak/contact-quick-actions";
import { EmptyState } from "@/components/app/empty-state";
import { RecordItem, RecordList } from "@/components/app/record-list";
import { StatusBadge } from "@/components/app/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  contactDetailHref,
  contactRoleLabel,
  otherContactRole,
  type ContactRole,
  type ContactStatusFilter,
} from "@/lib/contact-role-filter";
import { areaDisplayCase, formatDistrictCity, formatPostalCode } from "@/lib/label-format";
import { cn } from "@/lib/utils";
import { TYPEAHEAD_DEBOUNCE_MS, TYPEAHEAD_MIN_LENGTH } from "@/lib/use-typeahead-search";

const count = new Intl.NumberFormat("id-ID");

const TABS: readonly { label: string; value: ContactStatusFilter }[] = [
  { label: "Aktif", value: "active" },
  { label: "Diarsipkan", value: "archived" },
  { label: "Semua", value: "all" },
];

/** "Kecamatan, Kota 40135" from the Mengantar area label, or why there is none. */
export function contactAreaLine(contact: Pick<ContactSearchRow, "address" | "destinationAreaLabel">) {
  if (!contact.address) return "Belum ada alamat";
  if (!contact.destinationAreaLabel) return "Area belum dipilih";
  const postal = formatPostalCode(contact.destinationAreaLabel);
  return `${areaDisplayCase(formatDistrictCity(contact.destinationAreaLabel))}${postal ? ` ${postal}` : ""}`;
}

function RoleBadges({ contact, role, showArchived }: { contact: ContactSearchRow; role: ContactRole; showArchived: boolean }) {
  const other = otherContactRole(role);
  const holdsOther = role === "pengirim" ? contact.isRecipient : contact.isSender;
  if (!holdsOther && !(showArchived && contact.archived)) return null;
  return (
    <span className="flex flex-wrap gap-1.5">
      {holdsOther ? <Badge variant="outline">Juga {contactRoleLabel(other).toLowerCase()}</Badge> : null}
      {showArchived && contact.archived ? <StatusBadge label="Diarsipkan" tone="neutral" /> : null}
    </span>
  );
}

/**
 * The directory card. Tabs are links (server-filtered, counted per role); search is a Server Action
 * (`searchContacts`), so the term never enters the URL (spec 10 §5.1 "no PII in the URL"). It runs by
 * itself after a pause once three characters are typed; "Cari" runs it at once.
 */
export function ContactDirectoryList({
  page,
  role,
  rows,
  status,
  summary,
  totalPages,
}: {
  page: number;
  role: ContactRole;
  rows: ContactSearchRow[];
  status: ContactStatusFilter;
  summary: Record<ContactStatusFilter, number>;
  totalPages: number;
}) {
  const label = contactRoleLabel(role);
  const noun = label.toLowerCase();
  const [state, search, pending] = useActionState<ContactSearchState, FormData>(searchContacts, { rows: [], searched: false });
  const [query, setQuery] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const trimmed = query.trim();
  const searching = trimmed.length > 0 && state.searched;
  const shown = searching ? state.rows : rows;

  useEffect(() => {
    if (trimmed.length < TYPEAHEAD_MIN_LENGTH) return;
    const timer = setTimeout(() => formRef.current?.requestSubmit(), TYPEAHEAD_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmed]);

  const createHref = `/app/kontak/baru?peran=${role}`;
  const showArchived = status === "all";

  return (
    <Card className="gap-0 py-0">
      <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between md:px-6">
        <nav aria-label={`Status ${noun}`} className="inline-flex h-10 w-full items-center rounded-lg bg-muted p-1 max-md:h-auto md:w-auto">
          {TABS.map((tab) => {
            const current = tab.value === status;
            return (
              <Link
                aria-current={current ? "page" : undefined}
                className={cn(
                  "inline-flex h-8 min-w-0 flex-1 items-center justify-center rounded-md px-2 text-sm md:px-4 font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none max-md:h-11 md:flex-none",
                  current && "bg-card text-foreground shadow-sm",
                )}
                href={contactDirectoryHref(role, tab.value)}
                key={tab.value}
              >
                {tab.label} <span className="ml-1 tabular-nums">({count.format(summary[tab.value])})</span>
              </Link>
            );
          })}
        </nav>
        <form
          aria-busy={pending}
          className="flex w-full items-start gap-2 md:w-auto"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (!trimmed) return;
            const formData = new FormData(event.currentTarget);
            startTransition(() => search(formData));
          }}
          ref={formRef}
          role="search"
        >
          <input name="status" type="hidden" value={status} />
          <input name="peran" type="hidden" value={role} />
          <div className="grid min-w-0 flex-1 gap-1 md:w-64 md:flex-none">
            <label className="relative" htmlFor="contact-search">
              <span className="sr-only">Cari {noun}</span>
              <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-describedby={state.error ? "contact-search-error" : undefined}
                aria-invalid={Boolean(state.error && trimmed)}
                autoComplete="off"
                className="pr-10 pl-9 [&::-webkit-search-cancel-button]:appearance-none"
                id="contact-search"
                maxLength={80}
                name="q"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari nama atau telepon…"
                type="search"
                value={query}
              />
              {query ? (
                <button
                  aria-label="Hapus pencarian"
                  className="absolute top-1/2 right-1 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  onClick={() => setQuery("")}
                  type="button"
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              ) : null}
            </label>
            {state.error && trimmed ? <p className="text-sm text-destructive" id="contact-search-error" role="alert">{state.error}</p> : null}
          </div>
          <Button disabled={pending} type="submit" variant="outline">{pending ? "Mencari…" : "Cari"}</Button>
        </form>
      </div>

      <p aria-live="polite" className="sr-only">
        {searching ? `${count.format(shown.length)} ${noun} cocok dengan pencarian` : ""}
      </p>

      {shown.length === 0 ? (
        searching ? (
          <EmptyState
            action={<Button onClick={() => setQuery("")} type="button" variant="outline">Hapus pencarian</Button>}
            description="Periksa ejaan nama atau nomor telepon."
            icon={Search}
            title={`Tidak ada ${noun} yang cocok`}
          />
        ) : status === "archived" ? (
          <EmptyState icon={UserRound} title={`Belum ada ${noun} diarsipkan`} />
        ) : (
          <EmptyState
            action={<Button asChild variant="outline"><Link href={createHref}>Tambah {noun}</Link></Button>}
            description={role === "pengirim" ? "Simpan gerai atau gudang asal kiriman agar tidak diketik ulang." : "Simpan pembeli yang sering dikirimi agar tidak diketik ulang."}
            icon={UserRound}
            title={`Belum ada ${noun}`}
          />
        )
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <TableCaption className="sr-only">Daftar {noun}</TableCaption>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-6">Nama {noun}</TableHead>
                  <TableHead>Nomor telepon</TableHead>
                  <TableHead>Alamat utama</TableHead>
                  <TableHead className="pr-6 text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((contact) => (
                  <TableRow key={contact.id}>
                    <TableCell className="max-w-72 py-3 pl-6 whitespace-normal">
                      <span className="grid gap-1">
                        <span className="font-semibold wrap-anywhere">{contact.name}</span>
                        <RoleBadges contact={contact} role={role} showArchived={showArchived} />
                      </span>
                    </TableCell>
                    <TableCell>{contact.phone}</TableCell>
                    <TableCell className="max-w-md py-3 whitespace-normal">
                      <span className="grid gap-0.5">
                        {contact.address ? <span className="line-clamp-2 wrap-anywhere">{areaDisplayCase(contact.address)}</span> : null}
                        <span className="text-xs text-muted-foreground">
                          {contactAreaLine(contact)}
                          {contact.addressCount > 1 ? ` · +${contact.addressCount - 1} alamat` : null}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <span className="inline-flex items-center justify-end gap-1">
                        <WhatsAppButton name={contact.name} phone={contact.phone} />
                        <CopyPhoneButton name={contact.name} phone={contact.phone} />
                        <Button asChild className="ml-1" size="sm" variant="outline">
                          <Link aria-label={`Detail ${contact.name}`} href={contactDetailHref(contact.id, role)}>Detail</Link>
                        </Button>
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="md:hidden">
            <RecordList label={`Daftar ${noun}`}>
              {shown.map((contact) => (
                <RecordItem
                  detail={(
                    <span className="-ml-2 flex items-center gap-1">
                      <WhatsAppButton name={contact.name} phone={contact.phone} />
                      <CopyPhoneButton name={contact.name} phone={contact.phone} />
                    </span>
                  )}
                  href={contactDetailHref(contact.id, role)}
                  key={contact.id}
                  meta={contactAreaLine(contact)}
                  status={<RoleBadges contact={contact} role={role} showArchived={showArchived} />}
                  subtitle={<span className="tabular-nums">{contact.phone}</span>}
                  title={contact.name}
                />
              ))}
            </RecordList>
          </div>
        </>
      )}

      {!searching && shown.length > 0 ? (
        <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm md:flex-row md:items-center md:justify-between md:px-6">
          <p className="text-muted-foreground tabular-nums">{count.format(summary[status])} {noun}</p>
          {totalPages > 1 ? (
            <nav aria-label={`Halaman ${noun}`} className="flex items-center gap-2">
              <PageLink disabled={page <= 1} href={contactDirectoryHref(role, status, page - 1)} label="Sebelumnya">
                <ChevronLeft aria-hidden="true" />
              </PageLink>
              <span className="px-2 tabular-nums" aria-current="page">Halaman {page} dari {totalPages}</span>
              <PageLink disabled={page >= totalPages} href={contactDirectoryHref(role, status, page + 1)} label="Berikutnya">
                <ChevronRight aria-hidden="true" />
              </PageLink>
            </nav>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

function PageLink({ children, disabled, href, label }: { children: React.ReactNode; disabled: boolean; href: string; label: string }) {
  if (disabled) {
    return <Button aria-label={label} disabled size="icon-sm" type="button" variant="outline">{children}</Button>;
  }
  return (
    <Button asChild size="icon-sm" variant="outline">
      <Link aria-label={label} href={href}>{children}</Link>
    </Button>
  );
}
