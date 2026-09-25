/**
 * PR-60 / D-8: what a store awaiting Super Admin approval is told, in one place,
 * so the dashboard, the banner on every tenant page and a refused shipment
 * action say the same thing.
 */
export const TENANT_APPROVAL_REQUIRED_HREF = "/app?persetujuan=diperlukan";

export const TENANT_APPROVAL_COPY = {
  title: "Toko Anda menunggu persetujuan",
  body:
    "Super Admin GeraiCUAN sedang memeriksa pendaftaran toko ini. Sambil menunggu, lengkapi outlet, titik pickup dan hubungkan akun Mengantar milik toko Anda. Membuat, mengestimasi, mengimpor dan menerbitkan kiriman terbuka setelah toko disetujui; kami kirim email begitu keputusan dibuat.",
  refused:
    "Halaman itu untuk pengiriman, yang terbuka setelah toko disetujui. Sementara itu, siapkan toko Anda di bawah ini.",
} as const;
