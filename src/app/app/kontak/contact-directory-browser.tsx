"use client";

import { CircleAlert, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { searchContacts, type ContactSearchState, type SafeContactSearchRow } from "@/app/app/kontak/actions";
import { EmptyState } from "@/components/cms/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function SearchButton() {
  const { pending } = useFormStatus();
  return <Button className="min-h-11" disabled={pending} type="submit"><Search aria-hidden="true" />{pending ? "Mencari…" : "Cari"}</Button>;
}

export function ContactDirectoryBrowser({
  initialRows,
  status,
}: {
  initialRows: SafeContactSearchRow[];
  status: "active" | "archived";
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

  const clearSearch = () => {
    setQuery("");
    requestAnimationFrame(() => formRef.current?.requestSubmit());
  };

  return (
    <div className="grid min-w-0 gap-5">
      <nav aria-label="Status kontak" className="flex flex-wrap gap-2">
        <Button asChild className="min-h-11" variant={status === "active" ? "default" : "outline"}><Link href="/app/kontak?status=active">Aktif</Link></Button>
        <Button asChild className="min-h-11" variant={status === "archived" ? "default" : "outline"}><Link href="/app/kontak?status=archived">Diarsipkan</Link></Button>
      </nav>

      <form action={action} aria-busy={pending} className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-end" noValidate ref={formRef}>
        <input name="status" type="hidden" value={status} />
        <label className="grid min-w-0 flex-1 gap-1.5 text-sm font-medium" htmlFor="contact-search">
          Cari kontak
          <Input aria-describedby={state.error ? "contact-search-error" : "contact-search-help"} aria-invalid={Boolean(state.error)} className="min-h-11" id="contact-search" maxLength={80} name="q" onChange={(event) => setQuery(event.target.value)} placeholder="Nama atau nomor telepon" type="search" value={query} />
          <span className="text-xs font-normal text-muted-foreground" id="contact-search-help">Pencarian dikirim privat dan tidak disimpan di alamat halaman.</span>
        </label>
        <SearchButton />
        {query || state.searched ? <Button className="min-h-11" onClick={clearSearch} type="button" variant="outline"><X aria-hidden="true" />Hapus pencarian</Button> : null}
      </form>

      {state.error ? (
        <Alert id="contact-search-error" ref={errorRef} role="alert" tabIndex={-1} variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>Pencarian tidak dapat diproses</AlertTitle><AlertDescription><a href="#contact-search">{state.error}</a></AlertDescription></Alert>
      ) : (
        <section aria-label="Hasil pencarian kontak" className="grid min-w-0 gap-3 rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50" ref={resultRef} tabIndex={-1}>
          <p aria-live="polite" className="text-sm text-muted-foreground">Menampilkan {state.rows.length} kontak {status === "archived" ? "diarsipkan" : "aktif"}.</p>
          {state.rows.length === 0 ? (
            <EmptyState action={status === "active" ? <Button asChild className="min-h-11"><Link href="/app/kontak/baru"><Plus aria-hidden="true" />Buat kontak</Link></Button> : undefined} description={state.searched ? "Periksa ejaan atau hapus pencarian." : status === "archived" ? "Kontak yang diarsipkan akan tersedia di sini." : "Kontak tersimpan akan mempercepat pengisian draf kiriman."} icon={Search} title={state.searched ? "Tidak ada kontak yang cocok" : status === "archived" ? "Belum ada kontak diarsipkan" : "Belum ada kontak"} />
          ) : (
            <Table className="min-w-[34rem]" containerClassName="rounded-lg border focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50" containerProps={{ "aria-label": "Daftar kontak; geser horizontal untuk melihat seluruh kolom", role: "region", tabIndex: 0 }}>
              <TableCaption className="sr-only">Kontak tenant</TableCaption>
              <TableHeader><TableRow><TableHead className="sticky left-0 z-10 bg-card">Nama</TableHead><TableHead>Telepon</TableHead><TableHead>Peran</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>{state.rows.map((contact) => <TableRow key={contact.id}><TableCell className="sticky left-0 z-10 max-w-56 whitespace-normal bg-card font-medium group-hover:bg-muted/50"><Link className="flex min-h-11 items-center wrap-anywhere text-primary underline-offset-4 hover:underline" href={`/app/kontak/${contact.id}`}>{contact.name}</Link></TableCell><TableCell className="font-mono text-xs tabular-nums">{contact.phoneMasked}</TableCell><TableCell><div className="flex flex-wrap gap-1">{contact.isSender ? <Badge variant="secondary">Pengirim</Badge> : null}{contact.isRecipient ? <Badge variant="outline">Penerima</Badge> : null}</div></TableCell><TableCell>{contact.archived ? <Badge variant="outline">Diarsipkan</Badge> : <Badge variant="secondary">Aktif</Badge>}</TableCell></TableRow>)}</TableBody>
            </Table>
          )}
        </section>
      )}
    </div>
  );
}
