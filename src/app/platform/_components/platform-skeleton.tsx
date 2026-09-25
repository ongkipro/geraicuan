import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function CardSkeleton({ rows }: { rows: number }) {
  return (
    <Card className="gap-4">
      <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
      <CardContent className="grid gap-3">{Array.from({ length: rows }, (_, index) => <Skeleton className="h-10 w-full" key={index} />)}</CardContent>
    </Card>
  );
}

/** The final shape of a platform page while its reads run (spec 10 §6). */
export function PlatformSkeleton({
  cards,
  filter = true,
  label,
  tiles = 0,
  title,
}: {
  cards: number[];
  filter?: boolean;
  label: string;
  tiles?: number;
  title: string;
}) {
  return (
    <div aria-busy="true" aria-label={label} className="flex flex-col gap-6" role="status">
      <PageHeader title={title} />
      {filter ? (
        <div className="grid gap-2">
          <div className="flex flex-wrap gap-3"><Skeleton className="h-11 w-56 md:h-10" /><Skeleton className="h-11 w-28 md:h-10" /></div>
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
      ) : null}
      {tiles ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: tiles }, (_, index) => (
            <Card className="gap-3 px-5 max-md:px-4" key={index}><Skeleton className="h-5 w-32" /><Skeleton className="h-9 w-16" /><Skeleton className="h-4 w-40" /></Card>
          ))}
        </div>
      ) : null}
      {cards.map((rows, index) => <CardSkeleton key={index} rows={rows} />)}
    </div>
  );
}
