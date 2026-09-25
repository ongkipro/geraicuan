import { PlatformSkeleton } from "../_components/platform-skeleton";

export default function PlatformRegistrationsLoading() {
  return <PlatformSkeleton cards={[3, 3, 4]} filter={false} label="Memuat pendaftaran" title="Pendaftaran" />;
}
