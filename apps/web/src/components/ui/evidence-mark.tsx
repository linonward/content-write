"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

// 证据标记：mono 字号、1px 赭黄底边、最小命中区 24×24（触控 40×40）。
// 悬停或聚焦时由调用方高亮来源片段（见 EvidenceSource）。
function EvidenceMark({
  className,
  children,
  ...props
}: ComponentProps<"button">) {
  return (
    <button
      type="button"
      data-slot="evidence-mark"
      className={cn(
        "inline-flex min-h-6 min-w-6 items-center justify-center px-1 font-mono text-mono text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent pointer-coarse:min-h-10 pointer-coarse:min-w-10",
        className,
      )}
      {...props}
    >
      <span className="border-b border-evidence py-0.5">{children}</span>
    </button>
  );
}

// 来源片段：active 时底色过渡到 evidence-soft、底部 2px evidence 线；减少动效时无过渡。
function EvidenceSource({
  active,
  className,
  ...props
}: ComponentProps<"span"> & { active?: boolean }) {
  return (
    <span
      data-slot="evidence-source"
      data-active={active || undefined}
      className={cn(
        "rounded-xs box-decoration-clone transition-[background-color,box-shadow] duration-160 ease-out motion-reduce:transition-none data-active:bg-evidence-soft data-active:shadow-[inset_0_-2px_0_var(--color-evidence)]",
        className,
      )}
      {...props}
    />
  );
}

export { EvidenceMark, EvidenceSource };
