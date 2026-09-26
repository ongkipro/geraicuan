import type { ReactNode } from "react";

import { SettingsNav } from "./settings-nav";

/**
 * Spec 10 §4.10 settings layout: the page header, then the sub-menu card (a sticky 256px rail from
 * 1024px, one scrolling row of pills above the content below it) beside a content column of
 * cards capped near 760px.
 */
export function SettingsFrame({ children, header }: { children: ReactNode; header: ReactNode }) {
  return (
    <>
      {header}
      <div className="flex flex-col items-start gap-6 lg:flex-row">
        <SettingsNav />
        <div className="flex w-full min-w-0 max-w-3xl flex-1 flex-col gap-6" data-slot="settings-content">
          {children}
        </div>
      </div>
    </>
  );
}
