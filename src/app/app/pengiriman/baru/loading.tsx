import { Skeleton } from "@/components/ui/skeleton";

/** The final shape: header, numbered section cards and the 360px rail (the stepper is in the top bar). */
export default function NewShipmentLoading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6" role="status">
      <span className="sr-only">Memuat Buat kiriman…</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-5 w-full max-w-xl" />
      </div>
      <div className="flex flex-col items-start gap-6 lg:flex-row">
        <div className="flex w-full flex-1 flex-col gap-6">
          {["h-56", "h-72", "h-40", "h-48", "h-32"].map((height, index) => (
            <div className="flex flex-col gap-4 rounded-2xl bg-card p-6 shadow-card" key={index}>
              <Skeleton className="h-6 w-56" />
              <Skeleton className={`w-full rounded-lg ${height}`} />
            </div>
          ))}
        </div>
        <Skeleton className="hidden h-160 w-90 shrink-0 rounded-xl lg:block" />
      </div>
    </div>
  );
}
