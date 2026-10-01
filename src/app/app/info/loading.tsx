import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * T-273: Info terbaru's own shape while its read runs — the header, the category chips and a few
 * announcement cards — instead of inheriting the Dasbor skeleton (KPIs and charts) from /app.
 */
export default function AnnouncementsLoading() {
  return (
    <div aria-busy="true" aria-label="Memuat info terbaru" className="flex flex-col gap-6" role="status">
      <PageHeader description="Kabar dari tim GeraiCUAN: fitur baru, info kurir, jadwal pickup dan pemeliharaan." title="Info terbaru" />
      <div className="flex flex-col gap-4">
        <div className="flex w-full gap-1 rounded-2xl bg-card p-1.5 shadow-card md:w-fit">
          {[20, 28, 24, 28].map((width, index) => <Skeleton className="h-11 shrink-0 rounded-lg md:h-9" key={index} style={{ width: `${width * 4}px` }} />)}
        </div>
        {Array.from({ length: 3 }, (_, index) => (
          <Card className="gap-3" key={index}>
            <CardHeader className="gap-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-6 w-3/4" /></CardHeader>
            <CardContent className="grid gap-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" /></CardContent>
          </Card>
        ))}
      </div>
      <span className="sr-only">Memuat…</span>
    </div>
  );
}
