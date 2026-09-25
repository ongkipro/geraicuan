import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** The label page in its final shape: header, size card + history on the left, the sheet on the right. */
export default function LabelDetailLoading() {
  return (
    <div aria-busy="true" aria-label="Memuat label" className="flex flex-col gap-6" role="status">
      <div className="grid gap-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-72 max-w-full" />
        <Skeleton className="h-5 w-80 max-w-full" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        <div className="grid gap-6 lg:col-span-2">
          <Card className="gap-4 px-6 max-md:px-4">
            <Skeleton className="h-6 w-48" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Skeleton className="h-24 rounded-lg" />
              <Skeleton className="h-24 rounded-lg" />
            </div>
            <Skeleton className="h-10 w-56 max-md:h-11" />
          </Card>
          <Card className="gap-3 px-6 max-md:px-4">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-5 w-40" />
          </Card>
        </div>
        <div className="grid gap-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="aspect-2/3 w-full rounded-lg" />
        </div>
      </div>
      <span className="sr-only">Memuat label…</span>
    </div>
  );
}
