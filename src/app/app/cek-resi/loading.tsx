import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function TrackingLookupLoading() {
  return (
    <PageContainer aria-busy="true">
      <PageHeader eyebrow="Cek" title="Cek resi" />
      <div aria-label="Memuat formulir cek resi" className="grid max-w-2xl gap-6" role="status">
        {[1, 2].map((key) => <Skeleton className="h-20" key={key} />)}
      </div>
    </PageContainer>
  );
}
