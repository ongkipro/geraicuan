import { SettingsLoading } from "../_components/settings-skeleton";

export default function PickupSettingsLoading() {
  return <SettingsLoading cards={[{ rowHeight: "h-16", rows: 2 }, { rows: 2 }]} />;
}
