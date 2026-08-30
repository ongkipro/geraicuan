"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  loadShipmentEstimate,
  type ShipmentEstimateActionState,
} from "@/app/app/estimate-actions";

type EstimateService = {
  codEligible: boolean;
  deliveryEstimate: string;
  providerService: string;
  shippingAmountIdr: number;
};

type EstimateSnapshot = {
  retrievedAt: string;
  services: EstimateService[];
};

type DraftEstimatePanelProps = {
  draftId: string;
  isCod: boolean;
  snapshot: EstimateSnapshot | null;
};

const initialState: ShipmentEstimateActionState = {};

function formatIdr(value: number) {
  return new Intl.NumberFormat("id-ID", {
    currency: "IDR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function formatRetrievedAt(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

function EstimateButton({ hasSnapshot }: { hasSnapshot: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="sales-primary ship-submit" disabled={pending} type="submit">
      {pending ? "Memuat estimasi…" : hasSnapshot ? "Muat ulang estimasi" : "Muat estimasi"}
    </button>
  );
}

export function DraftEstimatePanel({ draftId, isCod, snapshot }: DraftEstimatePanelProps) {
  const [state, action] = useActionState(loadShipmentEstimate, initialState);
  const services = snapshot?.services ?? [];
  const codUnavailable = isCod && services.length > 0 && services.every((service) => !service.codEligible);

  return (
    <section aria-busy={false} className="ship-estimate" id="estimasi-draf">
      <h2>Estimasi layanan</h2>
      <p>Tarif berasal dari Mengantar untuk detail draf saat ini. Estimasi tidak menjamin penerbitan AWB.</p>

      {state.unconfigured ? (
        <div className="ship-blocked" role="status">
          <h3>Konfigurasi Mengantar belum tersedia.</h3>
          <p>Hubungi Tenant Admin untuk melengkapi konfigurasi outlet.</p>
        </div>
      ) : (
        <form action={action}>
          <input name="shipmentId" type="hidden" value={draftId} />
          <EstimateButton hasSnapshot={snapshot !== null} />
        </form>
      )}

      {state.error ? <p className="ship-error-summary" role="alert">{state.error}</p> : null}

      {snapshot && services.length > 0 ? (
        <>
          <p aria-live="polite">Diperbarui {formatRetrievedAt(snapshot.retrievedAt)} WIB.</p>
          {codUnavailable ? (
            <div className="ship-blocked" role="status">
              <h3>COD tidak tersedia.</h3>
              <p>Tidak ada layanan yang mendukung COD untuk rute ini.</p>
            </div>
          ) : null}
          <div
            aria-label="Daftar estimasi layanan Mengantar"
            className="bulk-scroll"
            role="region"
            tabIndex={0}
          >
            <table className="bulk-table">
              <caption>Tarif layanan Mengantar</caption>
              <thead>
                <tr>
                  <th scope="col">Layanan</th>
                  <th scope="col">Estimasi tiba</th>
                  <th scope="col">COD</th>
                  <th scope="col">Ongkir</th>
                </tr>
              </thead>
              <tbody>
                {services.map((service) => (
                  <tr key={service.providerService}>
                    <td>{service.providerService}</td>
                    <td>{service.deliveryEstimate}</td>
                    <td>
                      {service.codEligible ? (
                        <span className="contact-tag">Tersedia</span>
                      ) : (
                        <button
                          aria-label={`COD tidak tersedia untuk ${service.providerService}`}
                          className="contact-tag contact-tag-archived"
                          disabled
                          type="button"
                        >
                          COD tidak tersedia
                        </button>
                      )}
                    </td>
                    <td className="bulk-num">{formatIdr(service.shippingAmountIdr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}
