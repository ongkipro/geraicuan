"use client";

import { CircleAlert, Info, Plus, Search, UserRound, X } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { searchContacts, type ContactSearchState, type ContactSearchRow } from "@/app/app/kontak/actions";
import { AlsoRoleBadge, CopyPhoneButton, WhatsAppLink } from "@/app/app/kontak/contact-ui";
import { EmptyState } from "@/components/cms/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDistrictCity, formatPostalCode } from "@/lib/label-format";
import {
  contactDetailHref,
  contactMetricPrefix,
  contactRoleLabel,
  contactStatusEntries,
  otherContactRole,
  type ContactRole,
  type ContactStatusFilter,
} from "@/lib/contact-role-filter";
import { TYPEAHEAD_DEBOUNCE_MS, TYPEAHEAD_MIN_LENGTH } from "@/lib/use-typeahead-search";

const SEARCH_PRIVACY_NOTE = "Pencarian dikirim privat dan tidak disimpan di alamat halaman.";
const countFormatter = new Intl.NumberFormat("id-ID");

function SearchButton() {
  const { pending } = useFormStatus();
  return <Button className="min-h-11" disabled={pending} type="submit"><Search aria-hidden="true" /><span className="max-sm:sr-only">{pending ? "Mencari…" : "Cari"}</span></Button>;
}

function ContactArea({ contact, role }: { contact: ContactSearchRow; role: ContactRole }) {
  if (!contact.address) {
    return <span className="block text-xs text-muted-foreground">Belum ada alamat</span>;
  }
  const postalCode = formatPostalCode(contact.destinationAreaLabel);
  return (
    <>
      {/* Full street address only in the table (md and up); the phone card
          keeps the area summary so a row stays scannable (T-149). */}
      <span className="hidden wrap-anywhere md:line-clamp-2">{contact.address}</span>
      <span className="block wrap-anywhere text-xs text-muted-foreground">
        {contact.destinationAreaLabel ? formatDistrictCity(contact.destinationAreaLabel) : "Area belum dipilih"}
        {postalCode ? <span className="tabular-nums"> · {postalCode}</span> : null}
      </span>
      {contact.addressCount > 1 ? (
        <Link className="inline-flex min-h-6 items-center text-xs text-primary underline-offset-4 hover:underline" href={`${contactDetailHref(contact.id, role)}#alamat`}>
          +{contact.addressCount - 1} alamat
        </Link>
      ) : null}
    </>
  );
}

function StatusBadge({ archived }: { archived: boolean }) {
  return archived ? <Badge variant="outline">Diarsipkan</Badge> : <Badge variant="secondary">Aktif</Badge>;
}

/**
 * T-188: one role's contacts. The status filter (a server GET form) arrives as
 * `filter` so it shares one toolbar row with search; below `md` the rows are
 * cards, from `md` a table with a pinned name column.
 */
export function ContactDirectoryBrowser({
  filter,
  initialRows,
  role,
  status,
}: {
  filter?: ReactNode;
  initialRows: ContactSearchRow[];
  role: ContactRole;
  status: ContactStatusFilter;
}) {
  const label = contactRoleLabel(role);
  const noun = label.toLowerCase();
  const otherRole = otherContactRole(role);
  const holdsOther = (contact: ContactSearchRow) => (role === "pengirim" ? contact.isRecipient : contact.isSender);
  const statusEntry = contactStatusEntries(role).find((entry) => entry.value === status);
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
        <form action={action} aria-busy={pending} className="flex min-w-0 flex-1 items-center gap-2" noValidate ref={formRef}>
          <input name="status" type="hidden" value={status} />
          <input name="peran" type="hidden" value={role} />
          <label className="relative min-w-0 flex-1" htmlFor="contact-search">
            <span className="sr-only">Cari {noun}</span>
            <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input aria-describedby={state.error ? "contact-search-error contact-search-help" : "contact-search-help"} aria-invalid={Boolean(state.error)} className="min-h-11 pl-9" id="contact-search" maxLength={80} name="q" onChange={(event) => setQuery(event.target.value)} placeholder="Cari nama atau nomor telepon" ref={searchRef} type="search" value={query} />
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
            <span className="font-medium text-foreground" data-metric-id={`${contactMetricPrefix(role)}-LISTED`}>{countFormatter.format(state.rows.length)} {noun}</span>
            {state.searched ? " cocok dengan pencarian" : statusEntry ? ` · ${statusEntry.description}` : null}
          </p>
          {state.rows.length === 0 ? (
            <EmptyState
              action={state.searched ? undefined : createAction}
              description={state.searched ? "Periksa ejaan atau hapus pencarian." : status === "archived" ? `${label} yang diarsipkan akan tersedia di sini.` : role === "pengirim" ? "Simpan toko atau gudang asal kiriman agar tidak perlu mengetik ulang di setiap draf." : "Simpan pembeli yang sering menerima kiriman agar tidak perlu mengetik ulang di setiap draf."}
              icon={state.searched ? Search : UserRound}
              title={state.searched ? `Tidak ada ${noun} yang cocok` : status === "archived" ? `Belum ada ${noun} diarsipkan` : `Belum ada ${noun}`}
            />
          ) : (
            <>
              <ul aria-label={`Daftar ${noun}`} className="grid gap-2 md:hidden">
                {state.rows.map((contact) => (
                  <li className="grid gap-2 ios-glass-card rounded-2xl border border-border/60 p-3.5 shadow-xs" key={contact.id}>
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <Link className="inline-flex min-h-11 min-w-0 items-center font-medium wrap-anywhere text-primary underline-offset-4 hover:underline" href={contactDetailHref(contact.id, role)}>{contact.name}</Link>
                      {holdsOther(contact) ? <AlsoRoleBadge role={otherRole} /> : null}
                      {showStatus ? <StatusBadge archived={contact.archived} /> : null}
                    </div>
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <span className="wrap-anywhere font-mono text-sm tabular-nums">{contact.phone}</span>
                      <span className="flex shrink-0 items-center">
                        <WhatsAppLink name={contact.name} phone={contact.phone} />
                        <CopyPhoneButton name={contact.name} phone={contact.phone} />
                      </span>
                    </div>
                    <div className="min-w-0"><ContactArea contact={contact} role={role} /></div>
                  </li>
                ))}
              </ul>
              <Table className="min-w-[44rem]" containerClassName="hidden rounded-2xl border border-border/60 bg-card/80 backdrop-blur-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:block" containerProps={{ "aria-label": `Tabel ${noun}; geser horizontal untuk melihat seluruh kolom`, role: "region", tabIndex: 0 }}>
                <TableCaption className="sr-only">{label} tenant</TableCaption>
                <TableHeader><TableRow><TableHead className="sticky left-0 z-10 bg-inherit">Nama</TableHead><TableHead>Telepon</TableHead><TableHead>Alamat</TableHead>{showStatus ? <TableHead>Status</TableHead> : null}<TableHead className="w-24 text-right"><span className="sr-only">Aksi</span></TableHead></TableRow></TableHeader>
                <TableBody>{state.rows.map((contact) => (
                  <TableRow className="group" key={contact.id}>
                    <TableCell className="sticky left-0 z-10 max-w-64 whitespace-normal bg-inherit font-medium group-hover:bg-[color-mix(in_oklab,var(--muted)_50%,var(--card))]">
                      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                        <Link className="inline-flex min-h-8 items-center wrap-anywhere text-primary underline-offset-4 hover:underline" href={contactDetailHref(contact.id, role)}>{contact.name}</Link>
                        {holdsOther(contact) ? <AlsoRoleBadge role={otherRole} /> : null}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-3 font-mono text-xs tabular-nums">{contact.phone}</TableCell>
                    <TableCell className="max-w-72 whitespace-normal px-3"><ContactArea contact={contact} role={role} /></TableCell>
                    {showStatus ? <TableCell><StatusBadge archived={contact.archived} /></TableCell> : null}
                    <TableCell className="px-2 text-right"><span className="inline-flex items-center"><WhatsAppLink name={contact.name} phone={contact.phone} /><CopyPhoneButton name={contact.name} phone={contact.phone} /></span></TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            </>
          )}
        </section>
      )}
    </div>
  );
}
