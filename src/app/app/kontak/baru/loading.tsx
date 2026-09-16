import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function NewContactLoading() {
  return (
    <PageContainer aria-busy="true">
      <PageHeader
        description="Satu kontak dapat dipakai sebagai pengirim, penerima, atau keduanya."
        eyebrow="Data"
        title="Buat kontak"
      />
      <div aria-label="Memuat formulir kontak" className="grid gap-6" role="status">
        <Card className="shadow-none">
          <CardHeader className="border-b">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-64 max-w-full" />
          </CardHeader>
          <CardContent className="flex flex-wrap items-start gap-x-6 gap-y-5">
            <Skeleton className="h-16 w-full sm:w-80" />
            <Skeleton className="h-16 w-full sm:w-48" />
            <Skeleton className="h-16 w-full max-w-[42rem]" />
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardHeader className="border-b">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </CardHeader>
          <CardContent className="grid gap-5">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
        <Skeleton className="h-11 w-36" />
        <span className="sr-only">Memuat formulir kontak…</span>
      </div>
    </PageContainer>
  );
}
