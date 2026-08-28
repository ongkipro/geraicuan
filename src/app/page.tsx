import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "GeraiCUAN — CMS operasional outlet pengiriman",
  description: "CMS gratis untuk outlet pengiriman: kelola kiriman, resi, label, dan pembukuan operasional.",
  alternates: { canonical: "/" },
  openGraph: { title: "GeraiCUAN", description: "CMS operasional outlet pengiriman.", locale: "id_ID", type: "website" },
};

export default function Home() {
  return <div className="sales-page">
    <a className="sales-skip" href="#utama">Lompat ke konten utama</a>
    <header className="sales-header"><div className="sales-shell sales-header-inner"><strong>GeraiCUAN</strong><nav aria-label="Masuk"><Link href="/login/tenant">Masuk Tenant</Link><Link href="/login/super-admin">Masuk Super Admin</Link></nav></div></header>
    <main id="utama">
      <section className="sales-hero"><div className="sales-shell"><p className="sales-eyebrow">CMS operasional outlet pengiriman</p><h1>Kelola pengiriman outlet Anda dalam satu tempat.</h1><p className="sales-deck">GeraiCUAN membantu outlet pengiriman di Indonesia mencatat kiriman, mendapatkan nomor resi dari kurir, mencetak label, dan merapikan pembukuan operasional — gratis, tanpa langganan.</p><div className="sales-actions"><Link className="sales-primary" href="/login/tenant">Masuk Tenant</Link><Link className="sales-secondary" href="/login/super-admin">Masuk Super Admin</Link></div><p className="sales-note">Akun tenant dibuat lewat undangan dari tim GeraiCUAN. Belum ada pendaftaran mandiri.</p></div></section>
      <section className="sales-section"><div className="sales-shell sales-grid"><h2>Cara kerjanya</h2><ol className="sales-steps"><li><b>01</b><span><strong>Catat kiriman</strong><br />Satu per satu atau unggah banyak baris sekaligus.</span></li><li><b>02</b><span><strong>Cek layanan dan biaya</strong><br />Tampil sesuai akun kurir outlet Anda.</span></li><li><b>03</b><span><strong>Terbitkan resi</strong><br />Nomor resi datang dari kurir, bukan dari kami.</span></li><li><b>04</b><span><strong>Cetak label dan catat</strong><br />Label 100 × 150 mm plus catatan operasional otomatis.</span></li></ol></div></section>
      <section className="sales-section sales-sunken"><div className="sales-shell sales-grid"><h2>Yang Anda dapatkan</h2><dl className="sales-list"><div><dt>Outlet dan pickup</dt><dd>Alamat pickup default untuk setiap outlet.</dd></div><div><dt>Kiriman fleksibel</dt><dd>Kiriman satuan dan massal.</dd></div><div><dt>Kontak reusable</dt><dd>Direktori pengirim dan penerima.</dd></div><div><dt>COD dan non-COD</dt><dd>Rincian biaya dipisahkan dengan jelas.</dd></div><div><dt>Label cetak</dt><dd>Label 100 × 150 mm dan riwayat cetak.</dd></div><div><dt>Laporan operasional</dt><dd>Ringkasan harian dan bulanan dengan filter tanggal.</dd></div></dl></div></section>
      <section className="sales-section"><div className="sales-shell sales-grid"><h2>Yang perlu Anda tahu</h2><div className="sales-prose"><p>Data setiap tenant terpisah. Kredensial kurir tersimpan hanya di sisi server. Uang COD dicatat sebagai titipan, bukan pendapatan.</p><p>Label dicetak lewat browser Chromium di desktop.</p><p><strong>Belum termasuk:</strong> langganan atau tagihan, domain sendiri, stok barang, tarif kurir buatan sendiri, dan manifes serah-terima.</p></div></div></section>
      <section className="sales-section sales-login"><div className="sales-shell"><h2 id="sales-login-title">Pilih pintu masuk</h2><div className="sales-entries"><Link className="sales-entry sales-entry-primary" href="/login/tenant"><strong>Masuk Tenant</strong><span>Untuk Tenant Admin dan Operator outlet.</span></Link><Link className="sales-entry" href="/login/super-admin"><strong>Masuk Super Admin</strong><span>Untuk pengelolaan tenant dan operasional platform.</span></Link></div></div></section>
    </main>
    <footer className="sales-footer"><div className="sales-shell"><strong>GeraiCUAN</strong><p>Bahasa Indonesia · Rupiah (IDR) · zona waktu Indonesia</p><p><Link href="/login/tenant">Masuk Tenant</Link> · <Link href="/login/super-admin">Masuk Super Admin</Link></p><small>© 2026 GeraiCUAN</small></div></footer>
  </div>;
}
