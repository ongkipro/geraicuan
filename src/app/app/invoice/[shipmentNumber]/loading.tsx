import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** The invoice page in its final shape: header, media card on the left, the nota on the right. */
export default function InvoiceLoading() {
  return (
    <div aria-busy="true" aria-label="Memuat invoice" className="flex flex-col gap-6" role="status">
      <div className="grid gap-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-72 max-w-full" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        <div className="grid gap-6 lg:col-span-2">
          <Card className="gap-4 px-6 max-md:px-4">
            <Skeleton className="h-6 w-40" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Skeleton className="h-20 rounded-lg" />
              <Skeleton className="h-20 rounded-lg" />
            </div>
            <Skeleton className="h-10 w-40 max-md:h-11" />
          </Card>
        </div>
        <div className="grid gap-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-128 w-full rounded-lg" />
        </div>
      </div>
      <span className="sr-only">Memuat invoice…</span>
    </div>
  );
}
