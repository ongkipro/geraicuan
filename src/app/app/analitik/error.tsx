"use client";
type AnalyticsErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};


export default function AnalyticsError({ reset }: AnalyticsErrorProps) {
  return (
    <main className="ship-shell an-shell">
      <section className="ship-error-summary" role="alert">
        <h2>Analitik tidak dapat dimuat.</h2>
        <p>
          Rentang dan zona waktu tetap tersimpan pada alamat halaman. Coba muat
          ulang.
        </p>
        <button className="sales-primary" onClick={reset} type="button">
          Muat ulang
        </button>
      </section>
    </main>
  );
}
