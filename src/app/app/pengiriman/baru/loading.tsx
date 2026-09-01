import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer } from "@/components/cms/page-container";

export default function NewShipmentLoading() {
  return (
    <PageContainer width="form">
      <div aria-busy="true" aria-label="Memuat formulir draf kiriman" className="grid gap-6" role="status">
        <div className="grid gap-3"><Skeleton className="h-4 w-24" /><Skeleton className="h-9 w-64 max-w-full" /><Skeleton className="h-5 w-full max-w-xl" /></div>
        <Skeleton className="h-28 w-full rounded-lg" />
        <Skeleton className="h-80 w-full rounded-lg" />
        <span className="sr-only">Memuat formulir draf kiriman…</span>
      </div>
    </PageContainer>
  );
}
