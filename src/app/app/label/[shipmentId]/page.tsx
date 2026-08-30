import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { LabelPrintPanel } from "@/app/app/label/[shipmentId]/label-print-panel";
import { LabelSheet } from "@/app/app/label/[shipmentId]/label-sheet";
import { db } from "@/db/client";
import {
  LabelUnavailableError,
  listPrintEvents,
  loadPrintableLabel,
} from "@/db/label-print-repository";
import { withTenantContext } from "@/db/tenant-context";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { formatWibDateTime, recipientDensity } from "@/lib/label-format";

export const metadata: Metadata = { robots: { index: false } };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type LabelDetailPageProps = {
  params: Promise<{ shipmentId: string }>;
};

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

export default async function LabelDetailPage({ params }: LabelDetailPageProps) {
  const principal = await requireTenantPrincipal();
  const { shipmentId } = await params;
  if (!UUID_PATTERN.test(shipmentId)) notFound();

  const detail = await withTenantContext(
    db,
    principal.userId,
    principal.tenantId,
    async (tx, context) => {
      try {
        const label = await loadPrintableLabel(tx, context, shipmentId);
        const events = await listPrintEvents(tx, context, shipmentId);
        return { kind: "ready" as const, events, label };
      } catch (error) {
        if (!(error instanceof LabelUnavailableError)) throw error;
        if (error.reason === "NOT_FOUND") return { kind: "not-found" as const };
        return {
          kind: "blocked" as const,
          reason: error.reason,
        };
      }
    },
  );

  if (detail.kind === "not-found") notFound();
  const heading = detail.kind === "ready"
    ? `Label ${detail.label.awb}`
    : "Label kiriman";

  if (detail.kind === "blocked") {
    const awaiting = detail.reason === "AWAITING_UPSTREAM_PAYMENT";
    return (
      <main className="ship-shell label-page">
        <a className="sales-skip label-hide" href="#status-label">
          Lewati ke status label
        </a>
        <header className="ship-header label-hide">
          <p className="ship-wordmark">GeraiCUAN</p>
          <Link href="/app/label">Kembali ke daftar label</Link>
        </header>
        <section className="ship-intro label-hide">
          <p className="sales-eyebrow">LABEL KIRIMAN</p>
          <h1>{heading}</h1>
          <p>Pratinjau cetak tersedia setelah nomor resi diterbitkan.</p>
        </section>
        <section
          className="ship-blocked label-hide"
          id="status-label"
          role="status"
        >
          <h2>
            {awaiting
              ? "Menunggu pelunasan Mengantar."
              : "Label belum tersedia."}
          </h2>
          <p>
            {awaiting
              ? "Kiriman non-COD ini belum berstatus lunas di Mengantar, sehingga belum memiliki nomor resi. Tenant Admin perlu memulihkannya lebih dulu."
              : "Label hanya dapat dicetak setelah Mengantar mengembalikan nomor resi."}
          </p>
          <Link href="/app/label">Kembali ke daftar label</Link>
        </section>
      </main>
    );
  }

  const recipientLayout = recipientDensity({
    nameLength: detail.label.recipient.name.length,
    addressLength: detail.label.recipient.address.length,
    areaLabelLength: detail.label.destinationAreaLabel.length,
  });
  const inconsistentCod = detail.label.isCod && !detail.label.codBreakdown;

  return (
    <main className="ship-shell label-page">
      <a className="sales-skip label-hide" href="#pratinjau-label">
        Lewati ke pratinjau label
      </a>
      <header className="ship-header label-hide">
        <p className="ship-wordmark">GeraiCUAN</p>
        <Link href="/app/label">Kembali ke daftar label</Link>
      </header>

      <section className="ship-intro label-hide">
        <p className="sales-eyebrow">LABEL 100 × 150 MM</p>
        <h1>{heading}</h1>
        <p>
          Periksa data kiriman, kemudian gunakan dialog cetak browser dengan
          ukuran kertas 100 × 150 mm.
        </p>
      </section>

      <LabelPrintPanel
        lastPrintedAt={detail.label.lastPrintedAt?.toISOString() ?? null}
        printCount={detail.label.printCount}
        shipmentId={detail.label.shipmentId}
      />

      {recipientLayout.overCapacity ? (
        <section className="ship-blocked label-caution label-hide" role="status">
          <h2>Alamat melebihi kapasitas label.</h2>
          <p>
            Alamat penerima {detail.label.recipient.address.length} karakter
            melebihi kapasitas label; sebagian tidak tercetak. Verifikasi alamat
            sebelum menyerahkan paket.
          </p>
          <details>
            <summary>Lihat alamat penerima lengkap</summary>
            <p>{detail.label.recipient.address}</p>
          </details>
        </section>
      ) : null}

      {inconsistentCod ? (
        <section className="ship-blocked label-caution label-hide" role="status">
          <h2>Rincian COD tidak konsisten.</h2>
          <p>
            Total COD dari Mengantar tetap dicetak, tetapi rincian komponennya
            disembunyikan. Verifikasi kiriman sebelum menyerahkan paket.
          </p>
        </section>
      ) : null}

      <div
        aria-label="Pratinjau label 100 × 150 mm"
        className="label-preview"
        id="pratinjau-label"
        role="region"
        tabIndex={0}
      >
        <LabelSheet label={detail.label} />
      </div>

      <section
        aria-labelledby="riwayat-cetak-heading"
        className="label-history label-hide"
      >
        <h2 id="riwayat-cetak-heading">Riwayat cetak</h2>
        {detail.events.length === 0 ? (
          <div className="ship-blocked" role="status">
            <h2>Belum ada riwayat cetak.</h2>
            <p>Cetakan pertama akan tercatat setelah tombol cetak digunakan.</p>
          </div>
        ) : (
          <div
            aria-label="Riwayat cetak label"
            className="bulk-scroll"
            role="region"
            tabIndex={0}
          >
            <table className="bulk-table">
              <caption>Riwayat cetak label</caption>
              <thead>
                <tr>
                  <th scope="col">Cetak ke-</th>
                  <th scope="col">Waktu (WIB)</th>
                  <th scope="col">Aktor</th>
                  <th scope="col">Hasil</th>
                </tr>
              </thead>
              <tbody>
                {detail.events.map((event, index) => (
                  <tr key={`${event.printedAt.toISOString()}-${index}`}>
                    <td>{event.sequence ?? "—"}</td>
                    <td>{formatWibDateTime(event.printedAt)}</td>
                    <td>
                      {event.actorRole === "TENANT_ADMIN"
                        ? "Tenant Admin"
                        : "Operator"}{" "}
                      · {event.actorNameMasked}
                    </td>
                    <td>
                      {event.outcome === "PRINTED"
                        ? "Tercatat"
                        : event.reasonCode === "AWAITING_UPSTREAM_PAYMENT"
                          ? "Diblokir: menunggu pelunasan"
                          : "Diblokir: resi belum terbit"}
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
