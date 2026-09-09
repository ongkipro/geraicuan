import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function NewShipmentLoading() {
  return (
    <PageContainer width="form">
      {/* The heading is real, not a skeleton: fourteen of the sixteen loading
          states already render one, and without it the page has no h1 at all
          while it streams. */}
      <PageHeader
        description="Navigasi dan lingkup tenant tetap tersedia saat formulir draf dimuat."
        eyebrow="Pengiriman"
        title="Buat draf kiriman"
      />
      <div aria-busy="true" aria-label="Memuat formulir draf kiriman" className="grid gap-6" role="status">
        <Skeleton className="h-28 w-full rounded-lg" />
        <Skeleton className="h-80 w-full rounded-lg" />
        <span className="sr-only">Memuat formulir draf kiriman…</span>
      </div>
    </PageContainer>
  );
}
