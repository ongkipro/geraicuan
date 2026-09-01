"use client";

import { useFocusTargetOnMount } from "@/components/cms/retry-region-button";

export function FocusHeadingOnMount({ id }: { id: string }) {
  useFocusTargetOnMount(id);
  return null;
}
