import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** The detail's final shape (spec 10 §6): header, rail (status, next step), identity, route, cards. */
export default function ShipmentDetailLoading() {
  return (
    <div aria-busy="true" aria-label="Memuat detail kiriman" className="flex flex-col gap-6" role="status">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-5 w-full max-w-md" />
      </div>
      <div className="flex flex-col items-start gap-6 lg:flex-row">
        <div className="flex w-full shrink-0 flex-col gap-6 lg:order-2 lg:w-88">
          {[0, 1].map((key) => (
            <Card key={key}>
              <CardContent className="flex flex-col gap-3">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="flex w-full min-w-0 flex-1 flex-col gap-6 lg:order-1">
          <Card><CardContent className="grid grid-cols-2 gap-4 md:grid-cols-4">{[0, 1, 2, 3].map((key) => <Skeleton className="h-11" key={key} />)}</CardContent></Card>
          <Card><CardContent><Skeleton className="h-20 w-full" /></CardContent></Card>
          {[0, 1, 2].map((key) => (
            <Card key={key}>
              <CardContent className="flex flex-col gap-4">
                <Skeleton className="h-7 w-48" />
                <Skeleton className="h-24 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
      <span className="sr-only">Memuat detail kiriman…</span>
    </div>
  );
}
