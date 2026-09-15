"use client";

import { ChevronDown, FileUp } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { createSelectedDrafts, type BulkConfirmState, type BulkUploadState, uploadBulkIntake } from "@/app/app/impor/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BULK_TEMPLATE_HEADERS } from "@/lib/bulk-shipment-intake-contract";

type Outlet = { id: string; name: string };
type BulkIntakeFormProps = { initialPreview?: BulkUploadState["preview"]; outlets: Outlet[] };
type ConfirmablePreview = NonNullable<BulkUploadState["preview"]>;

function UploadButton() {
  const { pending } = useFormStatus();
  return <Button className="min-h-11 max-md:w-full md:min-h-8" disabled={pending} type="submit">{pending ? "Mencocokkan lokasi…" : "Periksa berkas"}</Button>;
}

function ConfirmButton({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return <Button className="min-h-11 max-md:w-full md:min-h-8" disabled={pending || count === 0} type="submit">{pending ? "Menyimpan…" : `Buat ${count} draf terpilih`}</Button>;
}

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(amount);
}

function PreviewConfirmation({ preview }: { preview: ConfirmablePreview }) {
  const [confirmState, confirmAction, confirmPending] = useActionState<BulkConfirmState, FormData>(createSelectedDrafts, {});
  const [selectedRows, setSelectedRows] = useState<Set<number>>(() => new Set());
  const confirmErrorRef = useRef<HTMLDivElement>(null);
  const allSelected = selectedRows.size === preview.validRows.length;
  const someSelected = selectedRows.size > 0 && !allSelected;

  useEffect(() => {
    if (confirmState.message || confirmState.errors?.length) confirmErrorRef.current?.focus();
  }, [confirmState.errors, confirmState.message]);

  const toggleAll = (checked: boolean) => setSelectedRows(checked ? new Set(preview.validRows.map((row) => row.row)) : new Set());
  const toggleRow = (row: number, checked: boolean) => setSelectedRows((current) => {
    const next = new Set(current);
    if (checked) next.add(row); else next.delete(row);
    return next;
  });

  if (preview.validRows.length === 0) {
    return <Alert><AlertTitle>Tidak ada draf yang dapat dibuat</AlertTitle><AlertDescription>Perbaiki lokasi_tujuan dan baris bermasalah lain di CSV, lalu unggah kembali.</AlertDescription></Alert>;
  }

  return (
    <form action={confirmAction} aria-busy={confirmPending} className="grid gap-4" noValidate>
      {confirmState.message || confirmState.errors?.length ? (
        <Alert ref={confirmErrorRef} role="alert" tabIndex={-1} variant="destructive">
          <AlertTitle>Konfirmasi belum dapat diproses</AlertTitle>
          <AlertDescription className="space-y-2">
            {confirmState.message ? <p>{confirmState.message}</p> : null}
            {confirmState.errors?.length ? <ul className="list-disc pl-5">{confirmState.errors.map((error, index) => <li key={`${error.row}-${error.field}-${index}`}>{error.row > 0 ? `Baris ${error.row}: ` : ""}{error.message}</li>)}</ul> : null}
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p aria-live="polite"><strong>{selectedRows.size}</strong> dari {preview.validRows.length} baris dipilih</p>
        <Button className="min-h-11 max-md:w-full md:min-h-8" onClick={() => toggleAll(!allSelected)} type="button" variant="outline">{allSelected ? "Kosongkan pilihan" : "Pilih semua baris valid"}</Button>
      </div>
      <Table className="min-w-[980px]" containerClassName="rounded-md border" containerProps={{ "aria-label": "Baris CSV siap dibuat", role: "region", tabIndex: 0 }}>
        <TableCaption className="sr-only">Baris siap dibuat</TableCaption>
        <TableHeader><TableRow>
          <TableHead className="sticky left-0 z-20 w-14 bg-card"><div className="flex min-h-11 items-center justify-center"><Checkbox className="after:-inset-3.5" aria-label="Pilih semua baris valid" checked={allSelected ? true : someSelected ? "indeterminate" : false} onCheckedChange={(checked) => toggleAll(checked === true)} /></div></TableHead>
          <TableHead className="sticky left-14 z-20 bg-card">Baris</TableHead><TableHead>Penerima</TableHead><TableHead>Lokasi di CSV</TableHead><TableHead>Area Mengantar</TableHead><TableHead>Berat</TableHead><TableHead>Pembayaran</TableHead><TableHead>Nilai barang</TableHead>
        </TableRow></TableHeader>
        <TableBody>{preview.validRows.map((row) => {
          const checked = selectedRows.has(row.row);
          return <TableRow data-state={checked ? "selected" : undefined} key={row.row}>
            <TableCell className="sticky left-0 z-10 bg-card"><div className="flex min-h-11 items-center justify-center"><Checkbox className="after:-inset-3.5" aria-label={`Pilih baris ${row.row}`} checked={checked} name="rowToken" onCheckedChange={(value) => toggleRow(row.row, value === true)} value={row.confirmationToken} /></div></TableCell>
            <TableCell className="sticky left-14 z-10 bg-card font-medium">{row.row}</TableCell><TableCell>{row.recipientName}</TableCell><TableCell className="max-w-56 whitespace-normal">{row.destinationQuery}</TableCell><TableCell className="max-w-72 whitespace-normal">{row.destinationAreaLabel}</TableCell><TableCell className="text-right tabular-nums">{row.packageWeightGrams} g</TableCell><TableCell>{row.isCod ? "COD" : "Non-COD"}</TableCell><TableCell className="text-right tabular-nums">Rp {formatRupiah(row.declaredValueIdr)}</TableCell>
          </TableRow>;
        })}</TableBody>
      </Table>
      <div className="flex justify-end border-t pt-4">
        <ConfirmButton count={selectedRows.size} />
      </div>
    </form>
  );
}

export function BulkIntakeForm({ initialPreview, outlets }: BulkIntakeFormProps) {
  const [uploadState, uploadAction, uploadPending] = useActionState<BulkUploadState, FormData>(uploadBulkIntake, { preview: initialPreview });
  const [fileName, setFileName] = useState("Belum ada berkas dipilih");
  const [outletId, setOutletId] = useState(outlets.length === 1 ? outlets[0].id : "");
  const [outletMissing, setOutletMissing] = useState(false);
  // Incremented on every blocked submit so focus moves after the invalid state
  // (aria-invalid, aria-describedby, role="alert" error) has rendered.
  const [outletBlockedAttempt, setOutletBlockedAttempt] = useState(0);
  const outletTriggerRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadErrorRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLElement>(null);
  const fileError = uploadState.fileError;
  // The form is noValidate and the value travels in a hidden input, so the
  // browser cannot enforce "required" on the Radix trigger. Block submit here
  // with the same message the server action returns; the server still validates.
  const outletError = outletMissing ? "Pilih outlet asal." : fileError?.field === "outletId" ? fileError.message : null;
  const preview = uploadState.preview;

  useEffect(() => { if (fileError) uploadErrorRef.current?.focus(); }, [fileError]);
  useEffect(() => { if (preview) previewRef.current?.focus(); }, [preview]);
  useEffect(() => { if (outletBlockedAttempt > 0) outletTriggerRef.current?.focus(); }, [outletBlockedAttempt]);

  return (
    <div className="grid min-w-0 w-full gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Unggah data kiriman</CardTitle>
          <CardDescription className="leading-6">Pemeriksaan dilakukan sebelum draf dibuat. Maksimal 256 KB dan 100 baris data.</CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          <form
            action={uploadAction}
            aria-busy={uploadPending}
            id="form-impor"
            noValidate
            onSubmit={(event) => {
              if (outletId) return;
              event.preventDefault();
              setOutletMissing(true);
              setOutletBlockedAttempt((attempt) => attempt + 1);
            }}
          >
            {fileError ? <Alert className="mb-5" ref={uploadErrorRef} role="alert" tabIndex={-1} variant="destructive"><AlertTitle>Impor belum dapat diproses</AlertTitle><AlertDescription>{fileError.message}</AlertDescription></Alert> : null}
            <FieldSet><FieldGroup>
              <Field className="max-w-md" data-invalid={Boolean(outletError) || undefined}>
                <FieldLabel htmlFor="outletId">Outlet asal</FieldLabel>
                {/* The chosen value is submitted through a plain hidden input, as on
                    the draft form, so it survives the form reset after an action. */}
                <Select onValueChange={(value) => { setOutletId(value); setOutletMissing(false); }} value={outletId}>
                  <SelectTrigger aria-describedby={outletError ? "outlet-error" : undefined} aria-invalid={Boolean(outletError) || undefined} aria-required="true" className="min-h-11 w-full md:min-h-8" id="outletId" ref={outletTriggerRef}>
                    <SelectValue placeholder="Pilih outlet" />
                  </SelectTrigger>
                  <SelectContent>
                    {outlets.map((outlet) => <SelectItem key={outlet.id} value={outlet.id}>{outlet.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <input name="outletId" type="hidden" value={outletId} />
                {/* FieldError renders role="alert", so the message is announced when it appears. */}
                {outletError ? <FieldError id="outlet-error">{outletError}</FieldError> : null}
              </Field>
              <Field data-invalid={fileError?.field === "csv" || undefined}>
                <FieldLabel htmlFor="csv">Berkas CSV</FieldLabel>
                <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-dashed bg-muted/30 p-3 sm:flex-row sm:items-center sm:gap-3">
                  <input accept=".csv,text/csv,text/plain" aria-describedby={fileError?.field === "csv" ? "csv-error csv-help" : "csv-help"} aria-invalid={fileError?.field === "csv" || undefined} className="sr-only" id="csv" name="csv" onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "Belum ada berkas dipilih")} ref={fileInputRef} required tabIndex={-1} type="file" />
                  <Button className="min-h-11 max-md:w-full md:min-h-8" onClick={() => fileInputRef.current?.click()} type="button" variant="outline"><FileUp aria-hidden="true" />Pilih berkas CSV</Button>
                  <span className="min-w-0 truncate text-sm text-muted-foreground">{fileName}</span>
                </div>
                <FieldDescription className="max-w-2xl" id="csv-help">Gunakan UTF-8 dan judul kolom persis seperti template. Belum ada data disimpan pada tahap ini.</FieldDescription>
                {fileError?.field === "csv" ? <FieldError id="csv-error">{fileError.message}</FieldError> : null}
              </Field>
              <div className="flex justify-end border-t pt-4">
                <UploadButton />
              </div>
            </FieldGroup></FieldSet>
          </form>
        </CardContent>
      </Card>

      {preview ? <section aria-labelledby="hasil-pemeriksaan-title" className="min-w-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring" id="hasil-pemeriksaan" ref={previewRef} tabIndex={-1}>
        <Card>
          <CardHeader aria-live="polite">
            <CardTitle id="hasil-pemeriksaan-title">Hasil pemeriksaan</CardTitle>
            <CardDescription>{preview.totalRows} baris · {preview.uniqueDestinationQueries} lokasi unik diperiksa · {preview.validRows.length} baris valid · {preview.errors.length} kesalahan</CardDescription>
          </CardHeader>
          <CardContent className="grid min-w-0 gap-4">
            {preview.errors.length > 0 ? <Table className="min-w-[720px]" containerClassName="rounded-md border" containerProps={{ "aria-label": "Baris CSV bermasalah", role: "region", tabIndex: 0 }}><TableCaption className="sr-only">Baris bermasalah</TableCaption><TableHeader><TableRow><TableHead className="sticky left-0 z-10 bg-card">Baris</TableHead><TableHead>Kolom</TableHead><TableHead>Lokasi di CSV</TableHead><TableHead>Kesalahan</TableHead></TableRow></TableHeader><TableBody>{preview.errors.map((error, index) => <TableRow className="group" key={`${error.row}-${error.field}-${index}`}><TableCell className="sticky left-0 z-10 bg-card font-medium group-hover:bg-[color-mix(in_oklab,var(--muted)_50%,var(--card))]">Baris {error.row}</TableCell><TableCell>{error.field}</TableCell><TableCell className="max-w-56 whitespace-normal">{error.query ?? "—"}</TableCell><TableCell className="max-w-96 whitespace-normal text-destructive"><p>{error.message}</p>{error.candidateLabels?.length ? <p className="mt-1 text-xs text-muted-foreground">Kemungkinan: {error.candidateLabels.join(" · ")}</p> : null}</TableCell></TableRow>)}</TableBody></Table> : null}
            <PreviewConfirmation key={preview.submissionId} preview={preview} />
          </CardContent>
        </Card>
      </section> : null}

      <Card>
        <CardContent>
          <details className="group/csv min-w-0" open>
            <summary className="flex min-h-11 cursor-pointer items-center rounded-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-8"><ChevronDown aria-hidden="true" className="mr-2 size-4 transition-transform group-open/csv:rotate-180" />Format CSV</summary><p className="max-w-2xl mt-2 text-sm text-muted-foreground">Nama dan urutan judul kolom harus sama persis. Semua kolom wajib kecuali tiga dimensi: isi ketiganya atau kosongkan semuanya.</p>
            <Table containerClassName="mt-4 rounded-md border" containerProps={{ "aria-label": "Dokumentasi kolom CSV", role: "region", tabIndex: 0 }}><TableCaption className="sr-only">Kolom template</TableCaption><TableHeader><TableRow><TableHead>Kolom</TableHead><TableHead>Aturan</TableHead></TableRow></TableHeader><TableBody>{BULK_TEMPLATE_HEADERS.map((header) => <TableRow key={header}><TableCell className="font-mono text-xs font-medium">{header}</TableCell><TableCell>{header === "panjang_cm" || header === "lebar_cm" || header === "tinggi_cm" ? "Opsional; isi ketiga dimensi bila digunakan." : header === "lokasi_tujuan" ? "Wajib; isi kelurahan/kecamatan/kota/provinsi/kode pos. Sistem hanya menerima satu hasil Mengantar yang tidak ambigu." : "Wajib; ikuti format dan batas formulir draf."}</TableCell></TableRow>)}</TableBody></Table>
          </details>
        </CardContent>
      </Card>
    </div>
  );
}
