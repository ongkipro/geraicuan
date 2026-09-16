import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * T-149: the CMS ships ONE frame (`wide`). The map stays because the ordering
 * contract `form <= standard < data < wide` is pinned by tests/cms-presentation,
 * and because a print or embedded surface may still ask for a narrower cap.
 * Pages do not pass `width`: four centred caps are why the page title used to
 * start at a different x on every route.
 */
const widths = {
  wide: "max-w-[88rem]",
  data: "max-w-7xl",
  standard: "max-w-5xl",
  form: "max-w-5xl",
} as const;

type PageContainerProps = ComponentProps<"div"> & {
  width?: keyof typeof widths;
};

export function PageContainer({
  className,
  width = "wide",
  ...props
}: PageContainerProps) {
  return (
    <div
      className={cn(
        // `@container/page` lets the content patterns split on the frame's own
        // width instead of the viewport's, which the sidebar rail distorts.
        "@container/page mx-auto grid w-full min-w-0 grid-cols-[minmax(0,1fr)] gap-6 md:gap-8 [&>*]:min-w-0",
        widths[width],
        className,
      )}
      {...props}
    />
  );
}
