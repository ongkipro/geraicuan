import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function NewShipmentLoading() {
  return (
    <PageContainer>
      {/* The heading is real, not a skeleton: fourteen of the sixteen loading
          states already render one, and without it the page has no h1 at all
          while it streams. */}
      <PageHeader
        description="Navigasi dan lingkup tenant tetap tersedia saat formulir draf dimuat."
        eyebrow="Pengiriman"
        title="Buat draf kiriman"
      />
      <div aria-busy="true" aria-label="Memuat formulir draf kiriman" className="grid gap-6" role="status">
        <Skeleton className="h-20 w-full rounded-xl" />
        {[0, 1, 2].map((section) => (
          <Card key={section}>
            <CardHeader><Skeleton className="h-5 w-32" /><Skeleton className="h-4 w-64 max-w-full" /></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></CardContent>
          </Card>
        ))}
        <span className="sr-only">Memuat formulir draf kiriman…</span>
      </div>
    </PageContainer>
  );
}
