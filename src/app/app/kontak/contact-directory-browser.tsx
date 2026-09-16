"use client";

import { Check, CircleAlert, MessageCircle, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { searchContacts, type ContactSearchState, type ContactSearchRow } from "@/app/app/kontak/actions";
import { EmptyState } from "@/components/cms/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDistrictCity, formatPostalCode } from "@/lib/label-format";
import { CONTACT_ROLE_FILTERS, contactRoleFilterLabel, type ContactRoleFilter, type ContactStatusFilter } from "@/lib/contact-role-filter";
import { TYPEAHEAD_DEBOUNCE_MS, TYPEAHEAD_MIN_LENGTH } from "@/lib/use-typeahead-search";

function SearchButton() {
  const { pending } = useFormStatus();
  return <Button className="min-h-11" disabled={pending} type="submit"><Search aria-hidden="true" />{pending ? "Mencari…" : "Cari"}</Button>;
}

/** Phone (already canonical "0…") as a wa.me link: the leading 0 becomes the 62 country code. */
function whatsappHref(phone: string) {
  return `https://wa.me/62${phone.replace(/^0/, "")}`;
}

function ContactAddressCell({ contact }: { contact: ContactSearchRow }) {
  if (!contact.address) {
    return <span className="block text-xs text-muted-foreground">Belum ada alamat</span>;
  }
  const postalCode = formatPostalCode(contact.destinationAreaLabel);
  return (
    <>
      {/* Full street address is desktop-only: at phone width only the area
          summary and postal code stay, keeping the row scannable and the
          table inside its scroll region (T-149) rather than widening it. */}
      <span className="hidden wrap-anywhere sm:block">{contact.address}</span>
      {contact.destinationAreaLabel ? (
        <>
          <span className="block wrap-anywhere text-xs text-muted-foreground">{formatDistrictCity(contact.destinationAreaLabel)}</span>
          {postalCode ? <span className="block text-xs tabular-nums text-muted-foreground">{postalCode}</span> : null}
        </>
      ) : (
        <span className="block text-xs text-muted-foreground">Area belum dipilih</span>
      )}
      {contact.addressCount > 1 ? (
        <Link className="block text-xs text-primary underline-offset-4 hover:underline" href={`/app/kontak/${contact.id}#alamat`}>
          +{contact.addressCount - 1} alamat
        </Link>
      ) : null}
    </>
  );
}

export function ContactDirectoryBrowser({
  initialRows,
  peran,
  status,
}: {
  initialRows: ContactSearchRow[];
  peran: ContactRoleFilter;
  status: ContactStatusFilter;
}) {
  const initialState: ContactSearchState = { rows: initialRows, searched: false };
  const [state, action, pending] = useActionState<ContactSearchState, FormData>(searchContacts, initialState);
  const [query, setQuery] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const resultRef = useRef<HTMLElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
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

  const clearSearch = () => {
    setQuery("");
  };

  return (
    <div className="grid min-w-0 gap-5">
      {/* T-167: peran is URL state (`?peran=pengirim|penerima|semua`) over the
          existing contacts.is_sender / is_recipient flags, so a dual-role
          contact appears under both Pengirim and Penerima. */}
      <nav aria-label="Peran kontak" className="flex flex-wrap gap-1 border-b pb-2">
        {CONTACT_ROLE_FILTERS.map((value) => (
          <Button asChild className="min-h-11" key={value} variant={peran === value ? "secondary" : "ghost"}>
            <Link aria-current={peran === value ? "true" : undefined} href={`/app/kontak?status=${status}&peran=${value}`}>
              {peran === value ? <Check aria-hidden="true" /> : null}
              {contactRoleFilterLabel(value)}
            </Link>
          </Button>
        ))}
      </nav>

      <form action={action} aria-busy={pending} className="flex flex-col gap-3 sm:flex-row sm:items-start" noValidate ref={formRef}>
        <input name="status" type="hidden" value={status} />
        <input name="peran" type="hidden" value={peran} />
        <label className="grid min-w-0 flex-1 gap-1.5 text-sm font-medium [&>input]:mt-0" htmlFor="contact-search">
          <span className="sr-only">Cari kontak</span>
          <Input aria-describedby={state.error ? "contact-search-error" : "contact-search-help"} aria-invalid={Boolean(state.error)} className="min-h-11" id="contact-search" maxLength={80} name="q" onChange={(event) => setQuery(event.target.value)} placeholder="Nama atau nomor telepon" type="search" value={query} />
          <span className="text-xs font-normal text-muted-foreground" id="contact-search-help">Pencarian dikirim privat dan tidak disimpan di alamat halaman.</span>
        </label>
        <SearchButton />
        {query || state.searched ? <Button className="min-h-11" onClick={clearSearch} type="button" variant="outline"><X aria-hidden="true" />Hapus pencarian</Button> : null}
      </form>

      {state.error ? (
        <Alert id="contact-search-error" ref={errorRef} role="alert" tabIndex={-1} variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>Pencarian tidak dapat diproses</AlertTitle><AlertDescription><a href="#contact-search">{state.error}</a></AlertDescription></Alert>
      ) : (
        <section aria-label="Hasil pencarian kontak" className="grid min-w-0 gap-3 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" ref={resultRef} tabIndex={-1}>
          <p aria-live="polite" className="max-w-2xl text-sm text-muted-foreground">Menampilkan {state.rows.length} kontak {status === "archived" ? "diarsipkan" : status === "all" ? "(aktif dan diarsipkan)" : "aktif"}{peran !== "semua" ? ` · ${contactRoleFilterLabel(peran)}` : ""}.</p>
          {state.rows.length === 0 ? (
            <EmptyState action={status !== "archived" ? <Button asChild className="min-h-11"><Link href="/app/kontak/baru"><Plus aria-hidden="true" />Buat kontak</Link></Button> : undefined} description={state.searched ? "Periksa ejaan atau hapus pencarian." : status === "archived" ? "Kontak yang diarsipkan akan tersedia di sini." : "Kontak tersimpan akan mempercepat pengisian draf kiriman."} icon={Search} title={state.searched ? "Tidak ada kontak yang cocok" : status === "archived" ? "Belum ada kontak diarsipkan" : "Belum ada kontak"} />
          ) : (
            <Table className="min-w-[44rem]" containerClassName="rounded-lg border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" containerProps={{ "aria-label": "Daftar kontak; geser horizontal untuk melihat seluruh kolom", role: "region", tabIndex: 0 }}>
              <TableCaption className="sr-only">Kontak tenant</TableCaption>
              <TableHeader><TableRow><TableHead className="sticky left-0 z-10 bg-inherit">Nama</TableHead><TableHead>Kontak</TableHead><TableHead>Alamat</TableHead><TableHead>Peran</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>{state.rows.map((contact) => <TableRow className="group" key={contact.id}><TableCell className="sticky left-0 z-10 max-w-56 whitespace-normal bg-inherit font-medium group-hover:bg-[color-mix(in_oklab,var(--muted)_50%,var(--card))]"><Link className="flex min-h-11 items-center wrap-anywhere text-primary underline-offset-4 hover:underline" href={`/app/kontak/${contact.id}`}>{contact.name}</Link></TableCell><TableCell className="max-w-40 whitespace-normal px-3"><span className="flex items-center gap-1.5"><span className="wrap-anywhere font-mono text-xs tabular-nums">{contact.phone}</span><a aria-label={`Kirim WhatsApp ke ${contact.name}`} className="inline-flex min-h-6 min-w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground" href={whatsappHref(contact.phone)} rel="noreferrer" target="_blank"><MessageCircle aria-hidden="true" className="size-4" /></a></span></TableCell><TableCell className="max-w-56 whitespace-normal px-3"><ContactAddressCell contact={contact} /></TableCell><TableCell><div className="flex flex-wrap gap-1">{contact.isSender ? <Badge variant="secondary">Pengirim</Badge> : null}{contact.isRecipient ? <Badge variant="outline">Penerima</Badge> : null}</div></TableCell><TableCell>{contact.archived ? <Badge variant="outline">Diarsipkan</Badge> : <Badge variant="secondary">Aktif</Badge>}</TableCell></TableRow>)}</TableBody>
            </Table>
          )}
        </section>
      )}
    </div>
  );
}
