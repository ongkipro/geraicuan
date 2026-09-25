import * as React from "react"

import { cn } from "cn"
import { TableScrollRegion } from "@/components/ui/table-scroll-region"
import styles from "./table.module.css"

function Table({
  className,
  containerClassName,
  containerProps,
  ...props
}: React.ComponentProps<"table"> & {
  containerClassName?: string
  containerProps?: Omit<React.ComponentProps<"div">, "className">
}) {
  const Container = containerProps?.role === "region" ? TableScrollRegion : "div"
  return (
    <Container
      data-slot="table-container"
      className={cn("relative w-full overflow-x-auto", containerClassName)}
      {...containerProps}
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", styles.table, className)}
        {...props}
      />
    </Container>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("bg-muted [&_tr]:border-b [&_tr]:border-b-border", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        // Opaque for the same reason every row fill is: a pinned cell inherits it.
        "border-t bg-muted font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        // Zebra striping is the cheapest way to keep a wide row readable; hover and
        // selection stay stronger than the stripe so they still read as state.
        // Every one of these fills is opaque because a pinned first column takes
        // `bg-inherit` from this row and would otherwise be see-through.
        "border-b bg-card transition-colors hover:bg-accent has-aria-expanded:bg-accent data-[state=selected]:bg-accent",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-11 px-4 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "px-4 py-3 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
