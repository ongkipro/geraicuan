import { cn } from "cn"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md motion-reduce:animate-none bg-foreground/10", className)}
      {...props}
    />
  )
}

export { Skeleton }
