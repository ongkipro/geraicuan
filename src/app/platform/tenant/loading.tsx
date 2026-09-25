import { PlatformSkeleton } from "../_components/platform-skeleton";

export default function PlatformTenantsLoading() {
  return <PlatformSkeleton cards={[8]} label="Memuat daftar tenant" title="Tenant" />;
}
