import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function FinanceLoading() {
  return <PageContainer aria-busy="true" aria-label="Memuat ledger dan rekonsiliasi">
    <PageHeader description="Menyiapkan ringkasan, antrean selisih, dan jejak ledger." eyebrow="Keuangan" title="Ledger & rekonsiliasi" />
    <div className="grid gap-3"><Skeleton className="h-5 w-36" /><Skeleton className="h-14 w-full rounded-md" /></div>
    <section className="grid gap-4"><Skeleton className="h-6 w-52" /><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <Skeleton className="h-28 rounded-xl" key={index} />)}</div></section>
    <section className="grid gap-4"><Skeleton className="h-6 w-64" /><Skeleton className="h-64 w-full rounded-md" /></section>
    <Skeleton className="h-64 w-full rounded-xl" />
    <section className="grid gap-4"><Skeleton className="h-6 w-40" /><Skeleton className="h-72 w-full rounded-md" /><div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center"><Skeleton className="h-8 w-24" /><Skeleton className="h-8 w-72 max-w-full" /></div></section>
  </PageContainer>;
}
