"use client";

import { Select as SelectPrimitive } from "@base-ui/react/select";
import { cva, type VariantProps } from "class-variance-authority";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

// docs/design-system.md 第 4 节“选择框”：标准用于表单，紧凑用于列表筛选栏；不用原生 select。
const Select = SelectPrimitive.Root;

const triggerVariants = cva(
  "group/select-trigger inline-flex w-full min-w-0 items-center justify-between rounded-sm border border-line-strong bg-surface text-left transition-[border-color,box-shadow] outline-none select-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-45 data-popup-open:border-accent aria-invalid:border-danger",
  {
    variants: {
      size: {
        md: "h-9 gap-2 pr-2.5 pl-3 text-body text-ink data-placeholder:text-ink-3 [&_svg]:size-4",
        // 紧凑：无标签，值为 ink-2，有非默认值时由调用方传 data-active 改为 ink。
        compact:
          "h-7.5 w-auto gap-1.5 pr-2 pl-3 text-label text-ink-2 data-active:text-ink [&_svg]:size-3.5",
      },
    },
    defaultVariants: { size: "md" },
  },
);

function SelectTrigger({
  className,
  size = "md",
  children,
  ...props
}: SelectPrimitive.Trigger.Props & VariantProps<typeof triggerVariants>) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(triggerVariants({ size }), className)}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon className="flex shrink-0 text-ink-2 transition-transform group-data-popup-open/select-trigger:rotate-180 motion-reduce:transition-none">
        <ChevronDownIcon />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn("truncate", className)}
      {...props}
    />
  );
}

// 菜单：浮层、宽度等于触发器、内边距 4；超过 8 项时内部滚动。
function SelectContent({
  className,
  children,
  ...props
}: SelectPrimitive.Popup.Props) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        className="z-50 outline-none"
        sideOffset={4}
        alignItemWithTrigger={false}
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            "max-h-(--available-height) w-(--anchor-width) min-w-32 origin-(--transform-origin) overflow-y-auto rounded-sm border border-line bg-surface p-1 text-body text-ink shadow-float outline-none data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 motion-reduce:animate-none",
            className,
          )}
          {...props}
        >
          <SelectPrimitive.List className="max-h-72">
            {children}
          </SelectPrimitive.List>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "group/select-item flex h-8 cursor-default items-center gap-2 rounded-xs px-2 text-label font-normal outline-none select-none data-disabled:text-ink-3 data-highlighted:bg-sunken data-selected:font-medium data-selected:text-accent",
        className,
      )}
      {...props}
    >
      <span className="flex size-3.5 shrink-0 items-center justify-center text-accent">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-3.5" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText className="truncate">
        {children}
      </SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

type Option = { value: string; label: React.ReactNode };

// 常用写法：给定选项列表与值，渲染触发器与菜单；选项只列出接口真实支持的值。
function SelectField({
  options,
  value,
  onValueChange,
  size = "md",
  placeholder,
  active,
  className,
  ...props
}: Omit<SelectPrimitive.Trigger.Props, "value" | "children"> & {
  options: readonly Option[];
  value: string;
  onValueChange: (value: string) => void;
  size?: "md" | "compact";
  placeholder?: React.ReactNode;
  active?: boolean;
}) {
  return (
    <Select
      items={options}
      value={value}
      onValueChange={(next) => onValueChange((next as string | null) ?? "")}
    >
      <SelectTrigger
        size={size}
        data-active={active || undefined}
        className={className}
        {...props}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export {
  Select,
  SelectContent,
  SelectField,
  SelectItem,
  SelectTrigger,
  SelectValue,
};
