"use client";

import { CircleAlert, Info, Plus, Search, UserRound, X } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { searchContacts, type ContactSearchState, type ContactSearchRow } from "@/app/app/kontak/actions";
import { AlsoRoleBadge, CopyPhoneButton, WhatsAppLink } from "@/app/app/kontak/contact-ui";
import { EmptyState } from "@/components/cms/empty-state";
import { desktopTableClassName, RecordItem, RecordList } from "@/components/cms/record-list";
import { ToneBadge } from "@/components/cms/shipment-status-badge";
import { dataTableSurfaceClassName } from "@/components/cms/data-table-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { areaDisplayCase, formatDistrictCity, formatPostalCode } from "@/lib/label-format";
import {
  contactDetailHref,
  contactMetricPrefix,
  contactRoleLabel,
  otherContactRole,
  type ContactRole,
  type ContactStatusFilter,
} from "@/lib/contact-role-filter";
import { cn } from "@/lib/utils";
import { TYPEAHEAD_DEBOUNCE_MS, TYPEAHEAD_MIN_LENGTH } from "@/lib/use-typeahead-search";

const SEARCH_PRIVACY_NOTE = "Pencarian dikirim privat dan tidak disimpan di alamat halaman.";
const countFormatter = new Intl.NumberFormat("id-ID");

function SearchButton() {
  const { pending } = useFormStatus();
  return <Button className="min-h-11" disabled={pending} type="submit" variant="outline"><Search aria-hidden="true" /><span className="max-sm:sr-only">{pending ? "Mencari…" : "Cari"}</span></Button>;
}

/** `inCard`: the record-list line is already `text-sm` muted (spec 10 §6), so the table's `text-xs` meta is dropped. */
function ContactArea({ contact, inCard = false, role }: { contact: ContactSearchRow; inCard?: boolean; role: ContactRole }) {
  const meta = inCard ? "" : "text-xs";
  if (!contact.address) {
    return <span className={`block ${meta} text-muted-foreground`}>Belum ada alamat</span>;
  }
  const postalCode = formatPostalCode(contact.destinationAreaLabel);
  return (
    <>
      {/* Full street address only in the table (md and up); the phone card
          keeps the area summary so a row stays scannable (T-149). */}
      <span className="hidden font-medium wrap-anywhere md:line-clamp-2">{areaDisplayCase(contact.address)}</span>
      <span className={`block wrap-anywhere ${meta} text-muted-foreground`}>
        {contact.destinationAreaLabel ? areaDisplayCase(formatDistrictCity(contact.destinationAreaLabel)) : "Area belum dipilih"}
        {postalCode ? <span className="tabular-nums"> · {postalCode}</span> : null}
      </span>
      {contact.addressCount > 1 ? (
        <Link className={`inline-flex min-h-11 items-center ${meta} text-primary underline-offset-4 hover:underline md:min-h-8`} href={`${contactDetailHref(contact.id, role)}#alamat`}>
          +{contact.addressCount - 1} alamat
        </Link>
      ) : null}
    </>
  );
}

function StatusBadge({ archived }: { archived: boolean }) {
  return archived ? <ToneBadge label="Diarsipkan" tone="neutral" /> : <ToneBadge label="Aktif" tone="ok" />;
}

/**
 * T-188: one role's contacts. The status filter (a server GET form) arrives as
 * `filter` so it shares one toolbar row with search; below `md` the rows are
 * cards, from `md` a table with a pinned name column.
 */
export function ContactDirectoryBrowser({
  filter,
  initialRows,
  pagination,
  role,
  status,
  totalCount,
}: {
  filter?: ReactNode;
  initialRows: ContactSearchRow[];
  /** Server-rendered pager for the directory list; hidden while search results show. */
  pagination?: ReactNode;
  role: ContactRole;
  status: ContactStatusFilter;
  /** Every contact under the status filter, not only this page's rows. */
  totalCount?: number;
}) {
  const label = contactRoleLabel(role);
  const noun = label.toLowerCase();
  const otherRole = otherContactRole(role);
  const holdsOther = (contact: ContactSearchRow) => (role === "pengirim" ? contact.isRecipient : contact.isSender);
  const showStatus = status === "all";
  const initialState: ContactSearchState = { rows: initialRows, searched: false };
  const [state, action, pending] = useActionState<ContactSearchState, FormData>(searchContacts, initialState);
  const [query, setQuery] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // T-199: a search typed into the box (debounced auto-search or Enter) keeps
    // focus and caret in the box; the polite count and the error alert announce
    // the outcome. Only a search started elsewhere (the Cari button) moves focus.
    if (document.activeElement === searchRef.current) return;
    if (state.error) errorRef.current?.focus();
    else if (state.searched) resultRef.current?.focus();
  }, [state.error, state.searched, state.rows]);

  // PR-48: results appear automatically once three characters are typed,
  // on a pause — the "Cari" button below is a manual affordance, not the
  // only path. A cleared query (back to zero characters) re-submits
  // immediately once a search had actually run, restoring the full list.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length > 0 && trimmed.length < TYPEAHEAD_MIN_LENGTH) return;
    if (trimmed.length === 0 && !state.searched) return;
    const timer = setTimeout(
      () => formRef.current?.requestSubmit(),
      trimmed.length === 0 ? 0 : TYPEAHEAD_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const createAction = status !== "archived" ? <Button asChild className="min-h-11"><Link href={`/app/kontak/baru?peran=${role}`}><Plus aria-hidden="true" />{label} baru</Link></Button> : undefined;

  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center">
        {filter}
        {/* T-206 (owner reference pengirim.html): status tabs start, search end of one row from lg. */}
        <form action={action} aria-busy={pending} className="flex min-w-0 flex-1 items-center gap-2 lg:ml-auto lg:max-w-md" noValidate ref={formRef}>
          <input name="status" type="hidden" value={status} />
          <input name="peran" type="hidden" value={role} />
          <label className="relative min-w-0 flex-1" htmlFor="contact-search">
            <span className="sr-only">Cari {noun}</span>
            <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input aria-describedby={state.error ? "contact-search-error contact-search-help" : "contact-search-help"} aria-invalid={Boolean(state.error)} className="min-h-11 pl-9" id="contact-search" maxLength={80} name="q" onChange={(event) => setQuery(event.target.value)} placeholder="Cari nama atau telepon" ref={searchRef} type="search" value={query} />
            <span className="sr-only" id="contact-search-help">{SEARCH_PRIVACY_NOTE}</span>
          </label>
          {query || state.searched ? (
            <Button aria-label="Hapus pencarian" className="size-11" onClick={() => setQuery("")} size="icon" type="button" variant="ghost"><X aria-hidden="true" /></Button>
          ) : null}
          <SearchButton />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button aria-label="Tentang privasi pencarian" className="size-11 text-muted-foreground" size="icon" type="button" variant="ghost"><Info aria-hidden="true" /></Button>
              </TooltipTrigger>
              <TooltipContent>{SEARCH_PRIVACY_NOTE}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </form>
      </div>

      {state.error ? (
        <Alert id="contact-search-error" ref={errorRef} role="alert" tabIndex={-1} variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>Pencarian tidak dapat diproses</AlertTitle><AlertDescription><a href="#contact-search">{state.error}</a></AlertDescription></Alert>
      ) : (
        <section aria-label={`Hasil pencarian ${noun}`} className="grid min-w-0 gap-3 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" ref={resultRef} tabIndex={-1}>
          {/* Keeps the outline h1 → h2 → h3 when the empty state renders its own h3. */}
          <h2 className="sr-only">Daftar {noun}</h2>
          <p aria-live="polite" className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground" data-metric-id={`${contactMetricPrefix(role)}-LISTED`}>{countFormatter.format(state.searched ? state.rows.length : totalCount ?? state.rows.length)} {noun}</span>
            {state.searched ? " cocok dengan pencarian" : null}
          </p>
          {state.rows.length === 0 ? (
            <EmptyState
              action={state.searched ? undefined : createAction}
              description={state.searched ? "Periksa ejaan atau hapus pencarian." : status === "archived" ? `${label} yang diarsipkan akan tersedia di sini.` : role === "pengirim" ? "Simpan gerai atau gudang asal kiriman agar tidak perlu mengetik ulang di setiap draf." : "Simpan pembeli yang sering menerima kiriman agar tidak perlu mengetik ulang di setiap draf."}
              icon={state.searched ? Search : UserRound}
              title={state.searched ? `Tidak ada ${noun} yang cocok` : status === "archived" ? `Belum ada ${noun} diarsipkan` : `Belum ada ${noun}`}
            />
          ) : (
            <>
              {/* Spec 10 §6 (T-203): name + status → phone with the one icon action → area. */}
              <RecordList label={`Daftar ${noun}`}>
                {state.rows.map((contact) => (
                  <RecordItem
                    key={contact.id}
                    primary={(
                      <span className="flex min-w-0 items-center justify-between gap-2">
                        <span className="wrap-anywhere tabular-nums">{contact.phone}</span>
                        <WhatsAppLink name={contact.name} phone={contact.phone} />
                      </span>
                    )}
                    secondary={<ContactArea contact={contact} inCard role={role} />}
                    status={holdsOther(contact) || showStatus ? (
                      <span className="flex flex-wrap justify-end gap-1">
                        {holdsOther(contact) ? <AlsoRoleBadge role={otherRole} /> : null}
                        {showStatus ? <StatusBadge archived={contact.archived} /> : null}
                      </span>
                    ) : undefined}
                    title={<Link className="inline-flex min-h-11 min-w-0 items-center wrap-anywhere text-primary underline-offset-4 hover:underline" href={contactDetailHref(contact.id, role)}>{contact.name}</Link>}
                  />
                ))}
              </RecordList>
              <Table className="min-w-[44rem]" containerClassName={cn(dataTableSurfaceClassName, desktopTableClassName)} containerProps={{ "aria-label": `Tabel ${noun}; geser horizontal untuk melihat seluruh kolom`, role: "region", tabIndex: 0 }}>
                <TableCaption className="sr-only">{label} tenant</TableCaption>
                <TableHeader><TableRow><TableHead className="sticky left-0 z-10 bg-inherit">Nama {noun}</TableHead><TableHead>Nomor telepon</TableHead><TableHead>{role === "penerima" ? "Alamat dan area" : "Alamat utama"}</TableHead>{showStatus ? <TableHead>Status</TableHead> : null}<TableHead className="w-24 text-right"><span className="sr-only">Aksi</span></TableHead></TableRow></TableHeader>
                <TableBody>{state.rows.map((contact) => (
                  <TableRow key={contact.id}>
                    <TableCell className="sticky left-0 z-10 max-w-64 whitespace-normal bg-inherit font-medium">
                      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                        <Link className="inline-flex min-h-8 items-center wrap-anywhere text-primary underline-offset-4 hover:underline" href={contactDetailHref(contact.id, role)}>{contact.name}</Link>
                        {holdsOther(contact) ? <AlsoRoleBadge role={otherRole} /> : null}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-3 tabular-nums">{contact.phone}</TableCell>
                    <TableCell className="max-w-72 whitespace-normal px-3"><ContactArea contact={contact} role={role} /></TableCell>
                    {showStatus ? <TableCell><StatusBadge archived={contact.archived} /></TableCell> : null}
                    <TableCell className="px-2 text-right"><span className="inline-flex items-center"><WhatsAppLink name={contact.name} phone={contact.phone} /><CopyPhoneButton name={contact.name} phone={contact.phone} /></span></TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            </>
          )}
          {state.searched ? null : pagination}
        </section>
      )}
    </div>
  );
}
