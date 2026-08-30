import { count } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { listContacts } from "@/db/contact-repository";
import { db } from "@/db/client";
import { withTenantContext } from "@/db/tenant-context";
import { contacts } from "@/db/schema";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";

export const metadata: Metadata = { robots: { index: false } };

type ContactDirectoryPageProps = { searchParams: Promise<{ q?: string }> };

function maskPhone(phone: string) {
  return phone.length <= 7 ? `${"•".repeat(Math.max(0, phone.length - 2))}${phone.slice(-2)}` : `${phone.slice(0, 4)}••••${phone.slice(-3)}`;
}

export default async function ContactDirectoryPage({ searchParams }: ContactDirectoryPageProps) {
  let principal;
  try {
    principal = await requireCmsScope("tenant");
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) redirect("/login/tenant");
    throw error;
  }
  if (principal.scope !== "tenant") redirect("/login/tenant");

  const query = ((await searchParams).q ?? "").trim();
  const queryError = query && (query.length < 2 || query.length > 80)
    ? query.length < 2 ? "Kata kunci minimal 2 karakter." : "Kata kunci maksimal 80 karakter."
    : null;
  const data = await withTenantContext(db, principal.userId, principal.tenantId, async (tx, context) => {
    const rows = queryError ? [] : await listContacts(tx, context, query);
    const [{ value: total }] = await tx.select({ value: count() }).from(contacts);
    return { rows, total };
  });

  return <main className="ship-shell"><a className="sales-skip" href="#hasil-kontak">Lewati ke hasil kontak</a><header className="ship-header"><p className="ship-wordmark">GeraiCUAN</p><Link href="/app">Kembali ke draf kiriman</Link></header><section className="ship-intro"><p className="sales-eyebrow">DIREKTORI KONTAK</p><h1>Kontak pengirim dan penerima</h1><p>Simpan data pihak kiriman sekali, pakai ulang pada draf berikutnya.</p><Link className="sales-primary" href="/app/kontak/baru">Kontak baru</Link></section>
    {data.total === 0 ? <section className="ship-blocked" role="status"><h2>Belum ada kontak tersimpan.</h2><p>Buat kontak pertama untuk dipakai pada draf berikutnya.</p></section> : <><form className="ship-form" method="get"><fieldset className="ship-group"><legend>Cari kontak</legend><label htmlFor="q">Kata kunci<input defaultValue={query} id="q" maxLength={80} minLength={2} name="q" type="search" /><span className="bulk-hint">Cari nama atau nomor telepon.</span></label><button className="sales-primary ship-submit" type="submit">Cari</button>{query ? <Link className="sales-secondary" href="/app/kontak">Hapus filter</Link> : null}</fieldset></form>{queryError ? <section className="ship-error-summary" role="alert"><h2>Pencarian tidak dapat diproses.</h2><p>{queryError}</p></section> : <section aria-label="Hasil pencarian kontak" className="bulk-outcome" id="hasil-kontak"><p className="bulk-hint">Menampilkan {data.rows.length} kontak.</p>{data.rows.length === 0 ? <section className="ship-blocked" role="status"><h2>Tidak ada kontak yang cocok.</h2><p>Periksa ejaan atau buat kontak baru.</p></section> : <div className="bulk-scroll" role="region" tabIndex={0} aria-label="Daftar kontak"><table className="bulk-table contact-table"><caption>Kontak tenant</caption><thead><tr><th scope="col">Nama</th><th scope="col">Telepon</th><th scope="col">Peran</th></tr></thead><tbody>{data.rows.map((contact) => <tr key={contact.id}><th scope="row"><Link href={`/app/kontak/${contact.id}`}>{contact.name}</Link></th><td className="contact-cell-phone">{maskPhone(contact.phone)}</td><td><p className="contact-tags">{contact.isSender ? <span className="contact-tag">Pengirim</span> : null}{contact.isRecipient ? <span className="contact-tag">Penerima</span> : null}</p></td></tr>)}</tbody></table></div>}</section>}</>}</main>;
}
