import { PlatformSkeleton } from "../_components/platform-skeleton";

export default function PlatformRegistrationsLoading() {
  return <PlatformSkeleton cards={[3, 3, 4]} description="Tinjau gerai yang mendaftar sendiri sebelum dapat mengirim." filter={false} label="Memuat pendaftaran" title="Pendaftaran" />;
}
