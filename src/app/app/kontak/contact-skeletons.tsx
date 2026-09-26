import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Loading skeletons in the final shape of each contact / lookup page (spec 10 §6). */

function HeaderSkeleton({ action = true, back = false, title }: { action?: boolean; back?: boolean; title: string }) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="grid gap-2">
        {back ? <Skeleton className="h-4 w-40" /> : null}
        <Skeleton className="h-4 w-12" />
        <p className="text-2xl font-bold text-muted-foreground">{title}</p>
        <Skeleton className="h-5 w-72 max-w-full" />
      </div>
      {action ? <Skeleton className="h-10 w-40" /> : null}
    </div>
  );
}

function Rows({ count }: { count: number }) {
  return (
    <div className="grid gap-4">
      {Array.from({ length: count }, (_, index) => <Skeleton className="h-10 w-full" key={index} />)}
    </div>
  );
}

export function ContactDirectorySkeleton({ title }: { title: string }) {
  return (
    <div aria-busy="true" aria-label={`Memuat ${title.toLowerCase()}`} className="contents" role="status">
      <HeaderSkeleton title={title} />
      <Card className="gap-0 py-0">
        <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:justify-between md:px-6">
          <Skeleton className="h-10 w-72 max-w-full" />
          <Skeleton className="h-10 w-80 max-w-full" />
        </div>
        <div className="p-4 md:px-6"><Rows count={6} /></div>
      </Card>
    </div>
  );
}

export function ContactFormSkeleton({ detail = false, title }: { detail?: boolean; title: string }) {
  if (detail) return <ContactDetailSkeleton title={title} />;
  return (
    <div aria-busy="true" aria-label={`Memuat ${title.toLowerCase()}`} className="contents" role="status">
      <HeaderSkeleton action={false} back title={title} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid gap-6 lg:col-span-2">
          {[2, 1, 3].map((rows, index) => (
            <Card className="px-6" key={index}>
              <Skeleton className="h-5 w-32" />
              <Rows count={rows} />
            </Card>
          ))}
        </div>
        <Card className="h-fit px-6">
          <Skeleton className="h-5 w-32" />
          <Rows count={3} />
        </Card>
      </div>
    </div>
  );
}

/** T-246/T-250: the detail page's final shape — white surface, bordered KPI cards, then the two columns. */
function ContactDetailSkeleton({ title }: { title: string }) {
  const section = (rows: number, key?: number) => (
    <div className="grid gap-4 border-t pt-6" key={key}>
      <Skeleton className="h-5 w-32" />
      <Rows count={rows} />
    </div>
  );
  return (
    <div aria-busy="true" aria-label={`Memuat ${title.toLowerCase()}`} className="flex flex-col gap-6 [main:has(&)]:bg-card!" role="status">
      <HeaderSkeleton back title={title} />
      <div className="grid gap-4 *:border sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Card className="px-5" key={index}>
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-8 w-20" />
          </Card>
        ))}
      </div>
      <div className="@container/detail">
        <div className="flex flex-col gap-6 @4xl/detail:grid @4xl/detail:grid-cols-[minmax(0,1fr)_340px] @4xl/detail:items-start @4xl/detail:gap-x-12" data-slot="contact-detail-columns">
          <div className="flex min-w-0 flex-col gap-6 @max-4xl/detail:contents" data-column="main">
            <div className="@max-4xl/detail:order-3">{section(5)}</div>
            <div className="@max-4xl/detail:order-2">{section(2)}</div>
          </div>
          <div className="flex min-w-0 flex-col gap-6 @max-4xl/detail:contents" data-column="side">
            <div className="@max-4xl/detail:order-1">{section(4)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LookupSkeleton({ eyebrow, rows, title }: { eyebrow: string; rows: number; title: string }) {
  return (
    <div aria-busy="true" aria-label={`Memuat ${title.toLowerCase()}`} className="contents" role="status">
      <div className="grid gap-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{eyebrow}</p>
        <p className="text-2xl font-bold text-muted-foreground">{title}</p>
        <Skeleton className="h-5 w-80 max-w-full" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="h-fit px-6 lg:col-span-2">
          <Rows count={rows} />
        </Card>
        <Card className="h-fit px-6">
          <Skeleton className="h-5 w-32" />
          <Rows count={2} />
        </Card>
      </div>
    </div>
  );
}
