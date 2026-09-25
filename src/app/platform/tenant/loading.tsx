import { PlatformSkeleton } from "../_components/platform-skeleton";

export default function PlatformTenantsLoading() {
  return <PlatformSkeleton cards={[8]} description="Status, penggunaan, dan kesiapan outlet setiap tenant." label="Memuat daftar tenant" title="Tenant" />;
}
