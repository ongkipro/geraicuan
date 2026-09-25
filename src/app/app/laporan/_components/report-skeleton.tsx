import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Page header + filter row skeleton, shared by both report routes. */
export function ReportHeaderSkeleton({ controls }: { controls: number }) {
  return (
    <>
      <div className="grid gap-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-5 w-96 max-w-full" />
      </div>
      <div className="flex flex-wrap gap-3">
        {Array.from({ length: controls }, (_, index) => <Skeleton className="h-10 w-44 max-md:w-full" key={index} />)}
      </div>
    </>
  );
}

/** A card with a title and `rows` table rows. */
export function CardSkeleton({ rows }: { rows: number }) {
  return (
    <Card>
      <CardHeader><Skeleton className="h-6 w-40" /></CardHeader>
      <CardContent className="grid gap-3">
        {Array.from({ length: rows }, (_, index) => <Skeleton className="h-8 w-full" key={index} />)}
      </CardContent>
    </Card>
  );
}
