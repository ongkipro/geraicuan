import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function FinanceLoading() {
  return <PageContainer aria-busy="true" aria-label="Memuat ledger dan rekonsiliasi" width="data">
    <PageHeader description="Menyiapkan ringkasan, antrean selisih, dan jejak ledger." eyebrow="Keuangan" title="Ledger & rekonsiliasi" />
    <div className="grid gap-3"><Skeleton className="h-5 w-36" /><Skeleton className="h-14 w-full rounded-xl" /><Skeleton className="hidden h-48 w-full rounded-xl md:block" /></div>
    <section className="grid gap-4 border-t pt-6"><Skeleton className="h-7 w-52" /><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <Skeleton className="h-28 rounded-xl" key={index} />)}</div></section>
    <section className="grid gap-4 border-t pt-6"><Skeleton className="h-7 w-64" /><Skeleton className="h-64 w-full rounded-xl" /></section>
    <Skeleton className="h-64 w-full rounded-xl" />
    <section className="grid gap-4 border-t pt-6"><Skeleton className="h-7 w-40" /><Skeleton className="h-72 w-full rounded-xl" /></section>
  </PageContainer>;
}
