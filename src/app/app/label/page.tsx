import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { db } from "@/db/client";
import { listPrintableShipments } from "@/db/label-print-repository";
import { withTenantContext } from "@/db/tenant-context";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { formatIdr, formatWibDateTime } from "@/lib/label-format";

export const metadata: Metadata = { robots: { index: false } };

type SearchValue = string | string[] | undefined;
type LabelIndexPageProps = {
  searchParams: Promise<{ q?: SearchValue; status?: SearchValue }>;
};

const AWB_SUFFIX_PATTERN = /^[a-z0-9]{3,24}$/i;

function firstQueryValue(value: SearchValue) {
  return Array.isArray(value) ? value[0] : value;
}

async function requireTenantPrincipal() {
  let principal;
  try {
    principal = await requireCmsScope("tenant");
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) {
      redirect("/login/tenant");
    }
    throw error;
  }
  if (principal.scope !== "tenant") redirect("/login/tenant");
  return principal;
}

export default async function LabelIndexPage({
  searchParams,
}: LabelIndexPageProps) {
  const principal = await requireTenantPrincipal();
  const query = await searchParams;
  const status = firstQueryValue(query.status) === "unpaid" ? "unpaid" : "issued";
  const awbSuffix = (firstQueryValue(query.q) ?? "").trim();
  const queryError = awbSuffix && !AWB_SUFFIX_PATTERN.test(awbSuffix)
    ? "Masukkan 3–24 huruf atau angka terakhir dari nomor resi."
    : null;

  const rows = await withTenantContext(
    db,
    principal.userId,
    principal.tenantId,
    (tx, context) => queryError
      ? Promise.resolve([])
      : listPrintableShipments(tx, context, {
          status,
          awbSuffix: awbSuffix || undefined,
        }),
  );

  return (
    <main className="ship-shell">
      <a className="sales-skip" href="#hasil-label">
        Lewati ke daftar label
      </a>
      <header className="ship-header">
        <p className="ship-wordmark">GeraiCUAN</p>
        <p>{principal.role === "TENANT_ADMIN" ? "Tenant Admin" : "Operator"}</p>
      </header>

      <section className="ship-intro">
        <p className="sales-eyebrow">LABEL KIRIMAN</p>
        <h1>Label dan riwayat cetak</h1>
        <p>
          Cetak label hanya untuk kiriman yang sudah memperoleh nomor resi dari
          Mengantar.
        </p>
        <Link className="sales-secondary" href="/app">
          Kembali ke draf kiriman
        </Link>
      </section>

      <form className="ship-form" method="get">
        <fieldset className="ship-group">
          <legend>Filter label</legend>
          <label htmlFor="status-label">
            Status kiriman
            <select defaultValue={status} id="status-label" name="status">
              <option value="issued">Resi sudah terbit</option>
              <option value="unpaid">Menunggu pelunasan</option>
            </select>
          </label>
          <label htmlFor="q-label">
            Akhiran nomor resi
            <input
              defaultValue={awbSuffix}
              id="q-label"
              inputMode="text"
              maxLength={24}
              minLength={3}
              name="q"
              pattern="[A-Za-z0-9]{3,24}"
              placeholder="Contoh: 123ABC"
              type="search"
            />
            <span className="bulk-hint">
              Gunakan 3–24 huruf atau angka terakhir, tanpa nama atau nomor
              telepon.
            </span>
          </label>
          <button className="sales-primary ship-submit" type="submit">
            Terapkan filter
          </button>
          {awbSuffix || status !== "issued" ? (
            <Link className="sales-secondary" href="/app/label">
              Hapus filter
            </Link>
          ) : null}
        </fieldset>
      </form>

      {queryError ? (
        <section className="ship-error-summary" role="alert">
          <h2>Filter tidak dapat diproses.</h2>
          <p>{queryError}</p>
        </section>
      ) : null}

      <section id="hasil-label">
        {rows.length === 0 ? (
          <div className="ship-blocked" role="status">
            <h2>
              {status === "unpaid"
                ? "Tidak ada kiriman menunggu pelunasan."
                : "Belum ada label yang dapat dicetak."}
            </h2>
            <p>
              {awbSuffix
                ? "Tidak ada nomor resi yang cocok dengan filter ini."
                : status === "unpaid"
                  ? "Kiriman non-COD yang belum lunas akan muncul di sini."
                  : "Label muncul setelah Mengantar menerbitkan nomor resi."}
            </p>
          </div>
        ) : (
          <div
            aria-label="Daftar label kiriman"
            className="bulk-scroll"
            role="region"
            tabIndex={0}
          >
            <table className="bulk-table contact-table">
              <caption>
                {status === "issued"
                  ? "Kiriman dengan resi terbit"
                  : "Kiriman menunggu pelunasan Mengantar"}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Nomor resi</th>
                  <th scope="col">Kurir</th>
                  <th scope="col">Penerima</th>
                  <th scope="col">Tujuan</th>
                  <th scope="col">Pembayaran</th>
                  <th scope="col">Riwayat</th>
                  <th scope="col">Tindakan</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.shipmentId}>
                    <td>
                      <strong>{row.awb ?? "Belum terbit"}</strong>
                      {row.issuedAt ? (
                        <span className="bulk-hint">
                          <br />
                          {formatWibDateTime(row.issuedAt)}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      {row.courier}
                      <span className="bulk-hint">
                        <br />
                        {row.providerService}
                      </span>
                    </td>
                    <td>
                      {row.recipientName}
                      <span className="contact-cell-phone">
                        <br />
                        {row.recipientPhoneMasked}
                      </span>
                    </td>
                    <td>{row.destinationAreaLabel}</td>
                    <td>
                      {row.isCod && row.providerCodAmountIdr !== null
                        ? `COD ${formatIdr(row.providerCodAmountIdr)}`
                        : "Non-COD"}
                    </td>
                    <td className="bulk-num">{row.printCount}×</td>
                    <td>
                      <Link href={`/app/label/${row.shipmentId}`}>
                        {row.status === "ISSUED" ? "Buka label" : "Lihat status"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
