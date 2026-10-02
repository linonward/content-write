import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// docs/design-system.md 第 4 节“按钮”：圆角 6，按下缩放 0.97，禁用 45% 不透明度。
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-sm border border-transparent text-label whitespace-nowrap transition-[background-color,color,border-color,scale] duration-120 outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:not-aria-[haspopup]:scale-97 disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45 motion-reduce:transition-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary: "bg-accent text-ink-inverse hover:bg-accent-hover",
        secondary:
          "border-line-strong bg-surface text-ink hover:bg-sunken aria-expanded:bg-sunken",
        ghost:
          "text-ink-2 hover:bg-sunken hover:text-ink aria-expanded:bg-sunken aria-expanded:text-ink",
        danger: "border-danger bg-surface text-danger hover:bg-danger-soft",
        // 实心红只用于确认对话框中的最终删除。
        "danger-solid": "bg-danger text-ink-inverse hover:bg-danger/90",
      },
      size: {
        sm: "h-7.5 px-2.5",
        md: "h-9 px-4",
        lg: "h-11 px-5",
        "icon-sm": "size-7",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
