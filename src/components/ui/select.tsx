import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-10 w-full appearance-none rounded-lg border border-border bg-surface px-3 text-sm",
        "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25",
        "disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
