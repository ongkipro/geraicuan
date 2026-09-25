import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function QuickRateLoading() {
  return <PageContainer aria-busy="true"><PageHeader eyebrow="Cek" title="Cek tarif" /><div aria-label="Memuat formulir cek tarif" className="grid max-w-2xl gap-6" role="status">{[1, 2, 3].map((key) => <Skeleton className="h-20" key={key} />)}</div></PageContainer>;
}
