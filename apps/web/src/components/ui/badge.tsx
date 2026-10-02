import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// 胶囊：固定高 22、12px、全圆角；所有语气同一字号，只换颜色。
const badgeVariants = cva(
  "inline-flex h-5.5 w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-full border border-transparent px-2.5 text-meta font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        neutral: "border-line-strong text-ink-2 [a]:hover:bg-sunken",
        muted: "bg-sunken text-ink-2 [a]:hover:text-ink",
        accent: "bg-accent-soft text-accent",
        evidence: "bg-evidence-soft text-evidence-ink",
        danger: "bg-danger-soft text-danger",
        // “模拟”标注：虚线 ink-3 边框。
        mock: "border-dashed border-ink-3 text-ink-2",
      },
    },
    defaultVariants: {
      variant: "muted",
    },
  },
);

function Badge({
  className,
  variant = "muted",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props,
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  });
}

export { Badge, badgeVariants };
