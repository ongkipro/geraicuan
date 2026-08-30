"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

import {
  createSelectedDrafts,
  type BulkConfirmState,
  type BulkUploadState,
  uploadBulkIntake,
} from "@/app/app/impor/actions";
import { BULK_INPUT_FIELDS, BULK_TEMPLATE_HEADERS } from "@/lib/bulk-shipment-intake-contract";
import type { BulkValidRow } from "@/lib/bulk-shipment-intake";

type Outlet = { id: string; name: string };
type BulkIntakeFormProps = { outlets: Outlet[] };

function UploadButton() {
  const { pending } = useFormStatus();
  return <button className="sales-primary ship-submit" disabled={pending} type="submit">{pending ? "Memeriksa…" : "Periksa berkas"}</button>;
}

function ConfirmButton() {
  const { pending } = useFormStatus();
  return <button className="sales-primary ship-submit" disabled={pending} type="submit">{pending ? "Menyimpan…" : "Buat draf terpilih"}</button>;
}

function inputValues(row: BulkValidRow) {
  return {
    declaredValue: String(row.input.declaredValueIdr),
    destinationAreaId: row.input.destinationAreaId,
    destinationAreaLabel: row.input.destinationAreaLabel,
    outletId: row.input.outletId,
    packageContent: row.input.packageContent,
    packageHeightCm: row.input.packageHeightCm === null ? "" : String(row.input.packageHeightCm),
    packageLengthCm: row.input.packageLengthCm === null ? "" : String(row.input.packageLengthCm),
    packageQuantity: String(row.input.packageQuantity),
    packageWeightGrams: String(row.input.packageWeightGrams),
    packageWidthCm: row.input.packageWidthCm === null ? "" : String(row.input.packageWidthCm),
    paymentType: row.input.isCod ? "COD" : "NON_COD",
    recipientAddress: row.input.recipientAddress,
    recipientName: row.input.recipientName,
    recipientPhone: row.input.recipientPhone,
    senderAddress: row.input.senderAddress,
    senderName: row.input.senderName,
    senderPhone: row.input.senderPhone,
  };
}

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(amount);
}

export function BulkIntakeForm({ outlets }: BulkIntakeFormProps) {
  const [uploadState, uploadAction, uploadPending] = useActionState<BulkUploadState, FormData>(
    uploadBulkIntake,
    {},
  );
  const [confirmState, confirmAction, confirmPending] = useActionState<BulkConfirmState, FormData>(
    createSelectedDrafts,
    {},
  );
  const errorRef = useRef<HTMLElement>(null);
  const fileError = uploadState.fileError?.message;
  const preview = uploadState.preview;

  useEffect(() => {
    if (fileError || confirmState.message) errorRef.current?.focus();
  }, [confirmState.message, fileError]);

  return (
    <div className="bulk-outcome">
      <form action={uploadAction} aria-busy={uploadPending} className="ship-form" id="form-impor">
        {fileError ? (
          <section className="ship-blocked" ref={errorRef} role="alert" tabIndex={-1}>
            <h2>Impor belum dapat diproses.</h2>
            <p>{fileError}</p>
          </section>
        ) : null}
        <fieldset className="ship-group">
          <legend>Unggah CSV</legend>
          <label htmlFor="outletId">Outlet asal
            <select defaultValue={outlets.length === 1 ? outlets[0].id : ""} id="outletId" name="outletId" required>
              <option value="">Pilih outlet</option>
              {outlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}
            </select>
          </label>
          <label htmlFor="csv">Berkas CSV
            <input accept=".csv,text/csv,text/plain" id="csv" name="csv" required type="file" />
          </label>
          <p className="bulk-hint">Maksimal 256 KB dan 100 baris data. Periksa berkas terlebih dahulu; belum ada draf yang dibuat.</p>
          <UploadButton />
        </fieldset>
      </form>

      {preview ? (
        <section aria-label="Hasil pemeriksaan CSV" className="bulk-outcome">
          <p className="bulk-hint">{preview.totalRows} baris diperiksa. {preview.validRows.length} baris siap dibuat.</p>
          {preview.errors.length > 0 ? (
            <div className="bulk-scroll" role="region" tabIndex={0} aria-label="Baris CSV bermasalah">
              <table className="bulk-table bulk-invalid">
                <caption>Baris bermasalah</caption>
                <thead><tr><th scope="col">Baris</th><th scope="col">Kolom</th><th scope="col">Kesalahan</th></tr></thead>
                <tbody>{preview.errors.map((error, index) => <tr key={`${error.row}-${error.field}-${index}`}><th scope="row">Baris {error.row}</th><td>{error.field}</td><td>{error.message}</td></tr>)}</tbody>
              </table>
            </div>
          ) : null}
          {preview.validRows.length === 0 ? <p className="ship-blocked">Tidak ada draf yang dibuat.</p> : (
            <form action={confirmAction} aria-busy={confirmPending} className="ship-form">
              {confirmState.message ? <section className="ship-blocked" ref={errorRef} role="alert" tabIndex={-1}><h2>Konfirmasi belum dapat diproses.</h2><p>{confirmState.message}</p></section> : null}
              {confirmState.errors?.length ? <p className="bulk-hint">Data diproses ulang sebelum disimpan. Periksa unggahan dan coba lagi.</p> : null}
              <div className="bulk-scroll" role="region" tabIndex={0} aria-label="Baris CSV siap dibuat">
                <table className="bulk-table">
                  <caption>Baris siap dibuat</caption>
                  <thead><tr><th scope="col">Pilih</th><th scope="col">Baris</th><th scope="col">Penerima</th><th scope="col">Area</th><th scope="col">Berat</th><th scope="col">Pembayaran</th><th scope="col">Nilai</th></tr></thead>
                  <tbody>{preview.validRows.map((row) => {
                    const values = inputValues(row);
                    return <tr key={row.row}>
                      <td className="bulk-select"><input aria-label={`Pilih baris ${row.row}`} defaultChecked name="baris" type="checkbox" value={row.row} />{BULK_INPUT_FIELDS.map((field) => <input key={field} name={`r${row.row}.${field}`} type="hidden" value={values[field]} />)}</td>
                      <th scope="row">{row.row}</th><td>{row.input.recipientName}</td><td>{row.input.destinationAreaLabel}</td><td className="bulk-num">{row.input.packageWeightGrams} g</td><td>{row.input.isCod ? "COD" : "Non-COD"}</td><td className="bulk-num">Rp {formatRupiah(row.input.declaredValueIdr)}</td>
                    </tr>;
                  })}</tbody>
                </table>
              </div>
              <ConfirmButton />
            </form>
          )}
        </section>
      ) : null}

      <details className="bulk-doc-wrap" open>
        <summary>Format CSV</summary>
        <p className="bulk-hint">Gunakan urutan judul kolom berikut. Semua kolom wajib kecuali tiga dimensi yang harus diisi lengkap atau dikosongkan semua.</p>
        <div className="bulk-scroll" role="region" tabIndex={0} aria-label="Dokumentasi kolom CSV">
          <table className="bulk-table"><caption>Kolom template</caption><thead><tr><th scope="col">Kolom</th><th scope="col">Aturan</th></tr></thead><tbody>
            {BULK_TEMPLATE_HEADERS.map((header) => <tr key={header}><th scope="row">{header}</th><td>{header === "panjang_cm" || header === "lebar_cm" || header === "tinggi_cm" ? "Opsional, isi ketiganya bila ada." : "Wajib diisi sesuai batas formulir draf."}</td></tr>)}
          </tbody></table>
        </div>
      </details>
    </div>
  );
}
