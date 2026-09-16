import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ContactDetailLoading() {
  return (
    <PageContainer aria-busy="true">
      <PageHeader
        actions={<Skeleton className="h-11 w-40" />}
        description="Data kontak dan alamat tersimpan sedang disiapkan."
        eyebrow="Kontak"
        title="Detail kontak"
      />
      <div aria-label="Memuat detail kontak" className="grid gap-6" role="status">
        <Card className="shadow-none">
          <CardHeader className="border-b"><Skeleton className="h-5 w-28" /><Skeleton className="h-4 w-64 max-w-full" /></CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /><Skeleton className="h-11 w-36 sm:col-span-2" /></CardContent>
        </Card>
        <Card className="shadow-none">
          <CardHeader className="border-b"><Skeleton className="h-5 w-24" /><Skeleton className="h-4 w-72 max-w-full" /></CardHeader>
          <CardContent className="grid gap-4"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></CardContent>
        </Card>
        <span className="sr-only">Memuat detail kontak…</span>
      </div>
    </PageContainer>
  );
}
