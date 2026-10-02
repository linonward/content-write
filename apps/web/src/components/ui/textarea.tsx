import type * as React from "react";
import { fieldControl } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        fieldControl,
        "flex field-sizing-content min-h-16 px-3 py-2",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
