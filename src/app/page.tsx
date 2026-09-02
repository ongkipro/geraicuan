import { ArrowRight, BookOpenCheck, PackageCheck, Printer, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "GeraiCUAN — CMS operasional outlet pengiriman",
  description: "CMS gratis untuk outlet pengiriman: kelola kiriman, resi, label, dan pembukuan operasional.",
  alternates: { canonical: "/" },
  openGraph: { title: "GeraiCUAN", description: "CMS operasional outlet pengiriman.", locale: "id_ID", type: "website" },
};

const workflow = [
  ["01", "Catat kiriman", "Satuan atau impor massal dalam satu antrean."],
  ["02", "Bandingkan layanan", "Tarif mengikuti akun kurir outlet Anda."],
  ["03", "Terbitkan resi", "AWB berasal langsung dari otoritas penyedia."],
  ["04", "Cetak dan rekonsiliasi", "Label 100 × 150 mm serta ledger operasional."],
] as const;

const capabilities = [
  { icon: PackageCheck, label: "Kiriman satuan dan massal" },
  { icon: Printer, label: "Label dan riwayat cetak" },
  { icon: BookOpenCheck, label: "COD, ledger, dan rekonsiliasi" },
  { icon: ShieldCheck, label: "Isolasi tenant dan kredensial server-side" },
] as const;

export default function Home() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <a className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:ring-2 focus:ring-ring" href="#utama">Lompat ke konten utama</a>
      <header className="border-b bg-background/95">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link className="text-sm font-semibold tracking-tight" href="/">GeraiCUAN</Link>
          <nav aria-label="Masuk" className="flex items-center gap-2">
            <Button asChild className="min-h-11" size="sm" variant="ghost"><Link href="/login/super-admin">Super Admin</Link></Button>
            <Button asChild className="min-h-11" size="sm"><Link href="/login/tenant">Masuk Tenant</Link></Button>
          </nav>
        </div>
      </header>

      <main id="utama">
        <section className="border-b">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[minmax(0,1.05fr)_minmax(22rem,.7fr)] lg:items-center lg:px-8 lg:py-28">
            <div>
              <p className="mb-4 text-xs font-medium uppercase tracking-[0.16em] text-primary">CMS operasional outlet pengiriman</p>
              <h1 className="max-w-3xl text-[clamp(2.5rem,1.7rem+3.2vw,4.75rem)] font-semibold leading-[1.02] tracking-[-0.055em]">Pengiriman rapi dari draf sampai rekonsiliasi.</h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">Catat kiriman, terbitkan resi penyedia, cetak label, dan pisahkan dana COD dari pendapatan—dalam satu workspace untuk tim outlet.</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild className="min-h-11" size="lg"><Link href="/login/tenant">Masuk Tenant <ArrowRight aria-hidden="true" /></Link></Button>
                <Button asChild className="min-h-11" size="lg" variant="outline"><Link href="#cara-kerja">Lihat cara kerja</Link></Button>
              </div>
              <p className="mt-4 text-xs leading-5 text-muted-foreground">Akun tenant dibuat melalui undangan tim GeraiCUAN. Belum ada pendaftaran mandiri.</p>
            </div>

            <div aria-label="Contoh alur kiriman" className="relative mx-auto w-full max-w-md lg:mr-0">
              <div className="absolute -left-3 top-6 h-[calc(100%-3rem)] w-px bg-primary/30" aria-hidden="true" />
              <div className="rounded-lg border bg-card p-5">
                <div className="flex items-start justify-between gap-4 border-b pb-4">
                  <div><p className="text-xs text-muted-foreground">SHIPMENT</p><p className="mt-1 font-mono text-lg font-semibold">GC-28F9A1C4</p></div>
                  <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800">AWB terbit</span>
                </div>
                <dl className="grid grid-cols-2 gap-x-5 gap-y-4 py-5 text-sm">
                  <div><dt className="text-xs text-muted-foreground">Outlet</dt><dd className="mt-1 font-medium">Jakarta Selatan</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Layanan</dt><dd className="mt-1 font-medium">Regular</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Pembayaran</dt><dd className="mt-1 font-medium">COD</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Label</dt><dd className="mt-1 font-medium">100 × 150 mm</dd></div>
                </dl>
                <div className="border-t pt-4">
                  <div className="flex items-center justify-between text-xs text-muted-foreground"><span>Dana COD</span><span className="font-mono text-foreground">Liabilitas</span></div>
                  <div className="mt-3 h-12 bg-[repeating-linear-gradient(90deg,var(--foreground)_0_2px,transparent_2px_5px)] opacity-75" aria-hidden="true" />
                  <p className="mt-2 text-center font-mono text-xs tracking-[0.2em]">AWB0123456789</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b bg-muted/30" id="cara-kerja">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[.55fr_1fr] lg:px-8 lg:py-20">
            <div><p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Cara kerja</p><h2 className="mt-2 text-3xl font-semibold tracking-tight">Satu lifecycle yang bisa ditelusuri.</h2></div>
            <ol className="border-t">
              {workflow.map(([number, title, description]) => (
                <li className="grid grid-cols-[2.5rem_1fr] gap-4 border-b py-5" key={number}>
                  <span className="font-mono text-xs text-muted-foreground">{number}</span>
                  <div><h3 className="font-medium">{title}</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p></div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="border-b">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_.7fr] lg:px-8 lg:py-20">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Yang dikelola</p>
              <h2 className="mt-2 max-w-xl text-3xl font-semibold tracking-tight">Operasi, data, dan uang tetap berada pada konteks yang benar.</h2>
              <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">Setiap tenant terpisah. Kredensial kurir hanya diselesaikan di server. Pokok COD dicatat sebagai titipan, bukan pendapatan GeraiCUAN.</p>
            </div>
            <ul className="grid border-t">
              {capabilities.map(({ icon: Icon, label }) => <li className="flex items-center gap-3 border-b py-4 text-sm font-medium" key={label}><Icon aria-hidden="true" className="size-4 text-primary" />{label}</li>)}
            </ul>
          </div>
        </section>

        <section className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-4 py-16 sm:px-6 md:flex-row md:items-center lg:px-8">
          <div><h2 className="text-2xl font-semibold tracking-tight">Masuk ke workspace GeraiCUAN</h2><p className="mt-2 text-sm text-muted-foreground">Pilih akses sesuai peran akun Anda.</p></div>
          <div className="flex flex-wrap gap-3"><Button asChild className="min-h-11"><Link href="/login/tenant">Masuk Tenant</Link></Button><Button asChild className="min-h-11" variant="outline"><Link href="/login/super-admin">Masuk Super Admin</Link></Button></div>
        </section>
      </main>

      <footer className="border-t"><div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-8 text-xs text-muted-foreground sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8"><strong className="text-foreground">GeraiCUAN</strong><span>Bahasa Indonesia · Rupiah (IDR) · zona waktu Indonesia · © 2026</span></div></footer>
    </div>
  );
}
