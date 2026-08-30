export default function AnalyticsLoading() {
  return (
    <main className="ship-shell an-shell">
      <section aria-live="polite" role="status">
        <p>Memuat analitik…</p>
        <div aria-hidden="true" className="an-skeleton">
          <div />
          <div />
          <div />
          <div />
        </div>
      </section>
    </main>
  );
}
