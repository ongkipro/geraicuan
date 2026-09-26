import { PlatformSkeleton } from "../../_components/platform-skeleton";

export default function PlatformTenantDetailLoading() {
  return <PlatformSkeleton cards={[4, 4, 5, 2, 2]} label="Memuat detail gerai" tiles={4} title="Detail gerai" />;
}
