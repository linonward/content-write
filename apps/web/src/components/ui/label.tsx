"use client";

import type * as React from "react";
import { cn } from "@/lib/utils";

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    // Callers supply htmlFor when using this reusable label.
    // biome-ignore lint/a11y/noLabelWithoutControl: This component receives its control association through props.
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-label text-ink select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-45 peer-disabled:cursor-not-allowed peer-disabled:opacity-45",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
