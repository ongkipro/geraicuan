export default function PlatformLoading() {
  return (
    <div className="ops-skeleton">
      <p role="status">Memuat data pemantauan…</p>
      <div aria-hidden="true">
        <span />
        <section />
        <section />
        <section />
      </div>
    </div>
  );
}
