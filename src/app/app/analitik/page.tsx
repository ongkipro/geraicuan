import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { CSSProperties } from "react";

import { db } from "@/db/client";
import {
  countTenantShipments,
  loadShipmentKpis,
  loadShipmentPage,
  loadShipmentTrend,
  type ShipmentRow,
} from "@/db/analytics-repository";
import { withTenantContext } from "@/db/tenant-context";
import {
  ANALYTICS_PRESETS,
  ANALYTICS_TIMEZONES,
  analyticsIssueMessage,
  buildTrendBuckets,
  formatInZone,
  formatRangeLabel,
  parseAnalyticsRange,
  parsePageNumber,
  serializeAnalyticsRange,
  type AnalyticsRange,
} from "@/lib/analytics-range";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";

export const metadata: Metadata = { robots: { index: false } };

const PAGE_SIZE = 50;
const countFormatter = new Intl.NumberFormat("id-ID");
const idrFormatter = new Intl.NumberFormat("id-ID", {
  currency: "IDR",
  maximumFractionDigits: 0,
  style: "currency",
});

const statusPresentation: Record<
  ShipmentRow["status"],
  { label: string; tone: "neutral" | "ok" | "warn" | "danger" }
> = {
  DRAFT: { label: "Draf", tone: "neutral" },
  ESTIMATED: { label: "Diestimasi", tone: "neutral" },
  SUBMISSION_QUEUED: { label: "Antre kirim", tone: "neutral" },
  SUBMISSION_UNKNOWN: { label: "Perlu rekonsiliasi", tone: "danger" },
  ISSUED: { label: "Resi terbit", tone: "ok" },
  AWAITING_UPSTREAM_PAYMENT: {
    label: "Menunggu pembayaran",
    tone: "warn",
  },
  FAILED: { label: "Gagal", tone: "danger" },
};

type AnalyticsPageProps = {
  searchParams: Promise<
    Record<string, string | string[] | undefined>
  >;
};

function paginationHref(range: AnalyticsRange, page: number): string {
  const params = serializeAnalyticsRange(range);
  params.set("halaman", String(page));
  return `/app/analitik?${params.toString()}`;
}

export default async function AnalyticsPage({
  searchParams,
}: AnalyticsPageProps) {
  let principal;
  try {
    principal = await requireCmsScope("tenant");
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) {
      redirect("/login/tenant");
    }
    throw error;
  }

  if (principal.scope !== "tenant") {
    redirect("/login/tenant");
  }

  if (principal.role !== "TENANT_ADMIN") {
    return (
      <main className="ship-shell an-shell">
        <header className="ship-header">
          <p className="ship-wordmark">GeraiCUAN</p>
          <p>Operator tenant</p>
        </header>
        <section className="ship-intro">
          <p className="sales-eyebrow">ANALITIK KIRIMAN</p>
          <h1>Ringkasan operasional</h1>
          <p>
            Ringkasan kiriman dan nilai COD tenant pada rentang terpilih.
          </p>
        </section>
        <section className="ship-blocked" role="status">
          <h2>Analitik tersedia untuk Tenant Admin.</h2>
          <p>
            Hubungi Tenant Admin tenant Anda untuk melihat ringkasan
            operasional.
          </p>
          <Link className="sales-secondary" href="/app">
            Kembali ke draf kiriman
          </Link>
        </section>
      </main>
    );
  }

  const now = new Date();
  const rawParams = await searchParams;
  const range = parseAnalyticsRange(rawParams, now);
  const parsedPage = parsePageNumber(rawParams.halaman);
  const requestedOffset = (parsedPage.page - 1) * PAGE_SIZE;

  const data = await withTenantContext(
    db,
    principal.userId,
    principal.tenantId,
    async (tx, context) => {
      const kpis = await loadShipmentKpis(tx, context, range);
      const trend = await loadShipmentTrend(tx, context, range);
      const shipmentPage = await loadShipmentPage(tx, context, range, {
        limit: PAGE_SIZE,
        offset: requestedOffset,
      });
      const tenantShipmentCount = await countTenantShipments(tx, context);
      return { kpis, trend, shipmentPage, tenantShipmentCount };
    },
  );

  const totalPages = Math.max(
    1,
    Math.ceil(data.shipmentPage.totalCount / PAGE_SIZE),
  );
  const page = Math.min(parsedPage.page, totalPages);
  const issues = [...range.issues, ...parsedPage.issues];
  const { periodLabel, timezoneLabel, presetLabel } =
    formatRangeLabel(range);
  const todayLocalDate = parseAnalyticsRange(
    { rentang: "hari-ini", tz: range.timezone },
    now,
  ).startDate;
  const isNotDefault =
    range.presetId !== "30-hari" ||
    range.timezone !== "Asia/Jakarta" ||
    range.issues.length > 0;

  const trendByKey = new Map(
    data.trend.map((point) => [point.key, point] as const),
  );
  const trendRows = buildTrendBuckets(range).map((bucket) => ({
    ...bucket,
    createdCount: trendByKey.get(bucket.key)?.createdCount ?? 0,
    issuedCount: trendByKey.get(bucket.key)?.issuedCount ?? 0,
  }));
  const maxTrendCreated = Math.max(
    0,
    ...trendRows.map(({ createdCount }) => createdCount),
  );
  const issuedPercentage =
    data.kpis.createdCount === 0
      ? null
      : Math.round(
          (data.kpis.issuedCount / data.kpis.createdCount) * 100,
        );

  return (
    <main className="ship-shell an-shell">
      <a className="sales-skip" href="#hasil-analitik">
        Lewati ke hasil analitik
      </a>
      <header className="ship-header">
        <p className="ship-wordmark">GeraiCUAN</p>
        <p>Tenant Admin</p>
      </header>
      <section className="ship-intro">
        <p className="sales-eyebrow">ANALITIK KIRIMAN</p>
        <h1>Ringkasan operasional</h1>
        <p>
          Ringkasan kiriman dan nilai COD tenant Anda pada rentang terpilih.
          Semua angka memakai zona waktu yang dipilih.
        </p>
        <Link className="sales-secondary" href="/app">
          Kembali ke draf kiriman
        </Link>
      </section>

      <details className="an-filters" open>
        <summary>Filter periode</summary>
        <form className="an-filter-body" method="get">
          <label htmlFor="rentang">
            Periode
            <select
              defaultValue={range.presetId}
              id="rentang"
              name="rentang"
            >
              {ANALYTICS_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="dari">
            Dari tanggal
            <input
              aria-describedby="kustom-hint"
              defaultValue={range.startDate}
              id="dari"
              max={todayLocalDate}
              name="dari"
              type="date"
            />
          </label>
          <label htmlFor="sampai">
            Sampai tanggal
            <input
              aria-describedby="kustom-hint"
              defaultValue={range.lastIncludedDate}
              id="sampai"
              max={todayLocalDate}
              name="sampai"
              type="date"
            />
            <span className="bulk-hint" id="kustom-hint">
              Dipakai saat memilih Rentang khusus.
            </span>
          </label>
          <label htmlFor="tz">
            Zona waktu
            <select defaultValue={range.timezone} id="tz" name="tz">
              {ANALYTICS_TIMEZONES.map((timezone) => (
                <option key={timezone.id} value={timezone.id}>
                  {timezone.label}
                </option>
              ))}
            </select>
          </label>
          <div className="an-filter-actions">
            <button className="sales-primary ship-submit" type="submit">
              Terapkan
            </button>
            <button
              className="sales-secondary ship-submit"
              name="khusus"
              type="submit"
              value="1"
            >
              Terapkan rentang khusus
            </button>
            {isNotDefault ? (
              <Link className="sales-secondary" href="/app/analitik">
                Setel ulang
              </Link>
            ) : null}
          </div>
        </form>
      </details>

      <p
        aria-live="polite"
        className="an-period"
        id="hasil-analitik"
        role="status"
      >
        Periode: <strong>{periodLabel}</strong> · {timezoneLabel} ·{" "}
        {presetLabel}. Dihitung dari waktu kiriman dibuat.
      </p>

      {issues.length > 0 ? (
        <section className="ship-blocked" role="status">
          <h2>Filter disesuaikan.</h2>
          <ul>
            {issues.map((issue, index) => (
              <li key={`${issue}-${index}`}>
                {analyticsIssueMessage(issue)}
              </li>
            ))}
          </ul>
          <p>
            Menampilkan {presetLabel} dalam {timezoneLabel}.
          </p>
        </section>
      ) : null}

      {data.tenantShipmentCount === 0 ? (
        <section className="ship-blocked" role="status">
          <h2>Belum ada kiriman.</h2>
          <p>
            Analitik terisi setelah draf pertama dibuat dan resi diterbitkan.
          </p>
          <Link className="sales-primary" href="/app">
            Buat draf kiriman
          </Link>
        </section>
      ) : data.kpis.createdCount === 0 ? (
        <section className="ship-blocked" role="status">
          <h2>Tidak ada kiriman pada {periodLabel}.</h2>
          <p>
            Kiriman tercatat pada periode lain. Perluas rentang untuk
            melihatnya.
          </p>
          <Link
            className="sales-secondary"
            href={`/app/analitik?rentang=30-hari&tz=${encodeURIComponent(range.timezone)}`}
          >
            Lihat 30 hari terakhir
          </Link>
        </section>
      ) : (
        <>
          <section className="an-section">
            <h2>Ringkasan</h2>
            <dl className="an-kpis">
              <div>
                <dt>Kiriman dibuat</dt>
                <dd>{countFormatter.format(data.kpis.createdCount)}</dd>
              </div>
              <div>
                <dt>Resi terbit</dt>
                <dd>
                  {countFormatter.format(data.kpis.issuedCount)}
                  {issuedPercentage === null ? null : (
                    <small>
                      {issuedPercentage}% dari kiriman dibuat
                    </small>
                  )}
                </dd>
              </div>
              <div>
                <dt>Menunggu pembayaran</dt>
                <dd>
                  {countFormatter.format(
                    data.kpis.awaitingPaymentCount,
                  )}
                </dd>
              </div>
              <div>
                <dt>Perlu tindakan</dt>
                <dd>
                  {countFormatter.format(data.kpis.needsActionCount)}
                  <small>Gagal atau perlu rekonsiliasi</small>
                </dd>
              </div>
            </dl>
            <dl className="an-kpis">
              <div>
                <dt>Ongkir provider</dt>
                <dd>{idrFormatter.format(data.kpis.providerShippingIdr)}</dd>
              </div>
              <div>
                <dt>Biaya layanan COD</dt>
                <dd>{idrFormatter.format(data.kpis.codServiceFeeIdr)}</dd>
              </div>
              <div>
                <dt>PPN biaya layanan</dt>
                <dd>{idrFormatter.format(data.kpis.codVatIdr)}</dd>
              </div>
              <div>
                <dt>Dana COD ditagihkan</dt>
                <dd>
                  {idrFormatter.format(data.kpis.codPrincipalIdr)}
                  <small>Titipan penerima, bukan pendapatan.</small>
                </dd>
              </div>
            </dl>
            <p className="an-money-note">
              Nilai dihitung dari kiriman berstatus Resi terbit pada rentang
              ini, bukan kas yang sudah diterima. Rekonsiliasi buku besar
              berada di halaman terpisah.
            </p>
          </section>

          <section className="an-section">
            <h2>
              Tren {range.granularity === "harian" ? "harian" : "bulanan"}
            </h2>
            <div
              aria-label="Tabel tren kiriman"
              className="an-scroll"
              role="region"
              tabIndex={0}
            >
              <table className="bulk-table an-trend">
                <caption>
                  Tren {range.granularity === "harian" ? "harian" : "bulanan"}
                  {" · "}
                  {periodLabel} · {timezoneLabel}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">
                      {range.granularity === "harian" ? "Tanggal" : "Bulan"}
                    </th>
                    <th scope="col">Kiriman dibuat</th>
                    <th scope="col">Resi terbit</th>
                  </tr>
                </thead>
                <tbody>
                  {trendRows.map((row) => (
                    <tr key={row.key}>
                      <th scope="row">{row.label}</th>
                      <td
                        className="an-num an-cell-bar"
                        style={
                          {
                            "--v":
                              maxTrendCreated === 0
                                ? 0
                                : row.createdCount / maxTrendCreated,
                          } as CSSProperties
                        }
                      >
                        {countFormatter.format(row.createdCount)}
                      </td>
                      <td className="an-num">
                        {countFormatter.format(row.issuedCount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="an-section">
            <h2>Kiriman</h2>
            <div
              aria-label="Tabel kiriman"
              className="an-scroll"
              role="region"
              tabIndex={0}
            >
              <table className="bulk-table an-table">
                <caption>
                  Kiriman dibuat pada {periodLabel} ({timezoneLabel})
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Dibuat</th>
                    <th scope="col">Kiriman</th>
                    <th scope="col">Outlet</th>
                    <th scope="col">Kurir</th>
                    <th scope="col">Layanan</th>
                    <th scope="col">Status</th>
                    <th scope="col">AWB</th>
                    <th scope="col">Nilai COD</th>
                  </tr>
                </thead>
                <tbody>
                  {data.shipmentPage.rows.map((row) => {
                    const status = statusPresentation[row.status];
                    return (
                      <tr key={row.shipmentId}>
                        <td>
                          {formatInZone(row.createdAt, range.timezone)}
                        </td>
                        <th scope="row">
                          {row.shipmentId.slice(0, 8).toUpperCase()}
                        </th>
                        <td>{row.outletName}</td>
                        <td>{row.courier ?? "—"}</td>
                        <td>{row.providerService ?? "—"}</td>
                        <td>
                          <span
                            className={`an-status an-status-${status.tone}`}
                          >
                            {status.label}
                          </span>
                        </td>
                        <td>{row.cnoteNo ?? "—"}</td>
                        <td className="an-num">
                          {row.isCod && row.providerCodAmountIdr !== null
                            ? idrFormatter.format(
                                row.providerCodAmountIdr,
                              )
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <nav
              aria-label="Navigasi halaman kiriman"
              className="an-pager"
            >
              <span>
                Halaman {page} dari {totalPages} ·{" "}
                {countFormatter.format(data.shipmentPage.totalCount)} kiriman
              </span>
              {page > 1 ? (
                <Link href={paginationHref(range, page - 1)}>
                  Sebelumnya
                </Link>
              ) : (
                <span aria-hidden="true">Sebelumnya</span>
              )}
              {page < totalPages ? (
                <Link href={paginationHref(range, page + 1)}>
                  Berikutnya
                </Link>
              ) : (
                <span aria-hidden="true">Berikutnya</span>
              )}
            </nav>
          </section>
        </>
      )}
    </main>
  );
}
