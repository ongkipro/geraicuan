import { courierDisplayName, MENGANTAR_COURIERS, mengantarCourierOfService, type MengantarCourier } from "@/lib/mengantar-couriers";
import { cn } from "@/lib/utils";

/**
 * A Mengantar courier's logo from `public/couriers/<key>.svg` (provenance in
 * `docs/courier-logos.md`). Accepts a courier key (`JT`) or one of its service
 * keys (`JNECargo`, `SAPLite`); anything no known courier claims is shown as its
 * display name, so a new provider courier still reads correctly.
 */
export function CourierLogo({ courier, className, decorative = false }: {
  courier: string;
  className?: string;
  /** Next to a visible courier name: an empty alt, and nothing rendered when there is no logo. */
  decorative?: boolean;
}) {
  const known: MengantarCourier | null = MENGANTAR_COURIERS.includes(courier as MengantarCourier)
    ? (courier as MengantarCourier)
    : mengantarCourierOfService(courier);

  if (!known) {
    if (decorative) return null;
    return <span className={cn("inline-flex h-6 items-center text-sm font-medium", className)}>{courierDisplayName(courier)}</span>;
  }

  return (
    // Static, pre-optimised SVG: next/image adds nothing but a required width.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/couriers/${known.toLowerCase()}.svg`}
      alt={decorative ? "" : courierDisplayName(known)}
      className={cn("h-6 w-auto", className)}
      decoding="async"
      draggable={false}
    />
  );
}
