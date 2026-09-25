import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Loading shape of one settings card: title, description line and `rows` body rows. */
export function SettingsCardSkeleton({ rowHeight = "h-10", rows = 2 }: { rowHeight?: "h-10" | "h-16" | "h-20"; rows?: number }) {
  return (
    <Card aria-hidden="true">
      <CardHeader>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {Array.from({ length: rows }, (_, index) => <Skeleton className={`${rowHeight} w-full`} key={index} />)}
      </CardContent>
    </Card>
  );
}

/** The content column while a settings page loads; the header and sub-menu stay in place. */
export function SettingsLoading({ cards }: { cards: readonly { rowHeight?: "h-10" | "h-16" | "h-20"; rows?: number }[] }) {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <p className="sr-only" role="status">Memuat pengaturan…</p>
      {cards.map((card, index) => <SettingsCardSkeleton key={index} {...card} />)}
    </div>
  );
}
