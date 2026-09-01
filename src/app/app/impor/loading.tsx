import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function BulkImportLoading() {
  return (
    <PageContainer aria-busy="true">
      <PageHeader description="Formulir dan outlet asal sedang disiapkan." eyebrow="Pengiriman" title="Memuat impor massal…" />
      <Card aria-label="Memuat formulir impor massal" className="max-w-3xl shadow-none" role="status">
        <CardHeader className="border-b"><Skeleton className="h-5 w-48" /><Skeleton className="h-4 w-80 max-w-full" /></CardHeader>
        <CardContent className="grid gap-5"><Skeleton className="h-16 w-full" /><Skeleton className="h-20 w-full" /><Skeleton className="h-11 w-36" /></CardContent>
      </Card>
    </PageContainer>
  );
}
