import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ContactDirectoryLoading() {
  return (
    <PageContainer aria-busy="true">
      <PageHeader
        actions={<Skeleton className="h-11 w-32" />}
        description="Simpan data pengirim dan penerima sekali, lalu gunakan kembali pada draf berikutnya."
        eyebrow="Data"
        title="Kontak"
      />
      <div aria-label="Memuat direktori kontak" className="grid gap-6" role="status">
        <Card className="shadow-none">
          <CardContent className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div className="grid gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-11 w-full" />
            </div>
            <Skeleton className="h-11 w-24" />
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardHeader className="border-b">
            <Skeleton className="h-4 w-40" />
          </CardHeader>
          <CardContent className="grid gap-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-4" key={index}>
                <Skeleton className="h-5 w-full max-w-72" />
                <Skeleton className="h-5 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
        <span className="sr-only">Memuat kontak…</span>
      </div>
    </PageContainer>
  );
}
