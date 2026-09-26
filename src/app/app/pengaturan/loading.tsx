import { SettingsLoading } from "./_components/settings-skeleton";

export default function ProfileSettingsLoading() {
  return <SettingsLoading cards={[{ rows: 2 }, { rows: 1 }, { rows: 3 }]} />;
}
