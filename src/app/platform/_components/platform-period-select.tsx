"use client";

import { ANALYTICS_PRESETS, type AnalyticsPresetId } from "@/lib/analytics-range";

/** Only preset disclosure needs hydration; platform reads stay server-side. */
export function PlatformPeriodSelect({ className, presetId }: { className: string; presetId: AnalyticsPresetId }) {
  return <select className={className} defaultValue={presetId} name="rentang" onChange={(event) => {
    if (event.target.value === "kustom") {
      const advanced = event.target.form?.querySelector<HTMLDetailsElement>("details[data-advanced]");
      if (advanced) advanced.open = true;
    }
  }}>
    {ANALYTICS_PRESETS.map(preset => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
  </select>;
}
