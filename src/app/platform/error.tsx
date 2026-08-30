"use client";

export default function PlatformError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <section className="ops-degraded" role="alert">
      <h1>Pemantauan tidak dapat dimuat.</h1>
      <p>Terjadi gangguan saat membaca data operasional. Tidak ada detail internal yang ditampilkan.</p>
      <button className="sales-primary" onClick={retry} type="button">Coba lagi</button>
    </section>
  );
}
