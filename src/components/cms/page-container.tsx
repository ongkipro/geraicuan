import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

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
  width = "standard",
  ...props
}: PageContainerProps) {
  return (
    <div
      className={cn(
        "mx-auto grid w-full min-w-0 grid-cols-[minmax(0,1fr)] gap-6 [&>*]:min-w-0",
        widths[width],
        className,
      )}
      {...props}
    />
  );
}
