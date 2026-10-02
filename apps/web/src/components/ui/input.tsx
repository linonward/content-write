import { Input as InputPrimitive } from "@base-ui/react/input";
import type * as React from "react";
import { cn } from "@/lib/utils";

// 高 36、圆角 6、surface 底、line-strong 边；聚焦 accent 边加 3px 光晕，错误 danger 边。
const fieldControl =
  "w-full min-w-0 rounded-sm border border-line-strong bg-surface text-body text-ink transition-[border-color,box-shadow] outline-none placeholder:text-ink-3 focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-45 aria-invalid:border-danger aria-invalid:focus-visible:ring-danger/20";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(fieldControl, "h-9 px-3", className)}
      {...props}
    />
  );
}

export { fieldControl, Input };
