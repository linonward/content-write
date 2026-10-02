"use client";

import { UploadIcon } from "lucide-react";
import { type ComponentProps, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// 自绘拖放区：虚线 line-strong、sunken 底；替代浏览器原生的英文文件选择控件。
// 内部仍是一个带 name 的 file input，表单用 FormData 读取即可。
function FileDropzone({
  id,
  className,
  hint = "拖放文件到这里，或点击选择",
  onChange,
  ...props
}: Omit<ComponentProps<"input">, "type"> & { id: string; hint?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);

  return (
    <label
      htmlFor={id}
      data-dragging={dragging || undefined}
      className={cn(
        "flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-sm border border-dashed border-line-strong bg-sunken p-4 text-center text-body text-ink-2 transition-colors hover:text-ink has-focus-visible:border-accent has-focus-visible:ring-3 has-focus-visible:ring-accent/20 has-disabled:cursor-not-allowed has-disabled:opacity-45 data-dragging:border-accent data-dragging:bg-accent-soft",
        className,
      )}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const files = event.dataTransfer.files;
        if (!input.current || files.length === 0) return;
        input.current.files = files;
        setFileName(files[0]?.name ?? "");
        input.current.dispatchEvent(new Event("change", { bubbles: true }));
      }}
    >
      <UploadIcon aria-hidden className="size-4.5 text-ink-3" />
      <span className={cn(fileName && "font-medium text-ink")}>
        {fileName || hint}
      </span>
      <input
        ref={input}
        id={id}
        type="file"
        className="sr-only"
        onChange={(event) => {
          setFileName(event.currentTarget.files?.[0]?.name ?? "");
          onChange?.(event);
        }}
        {...props}
      />
    </label>
  );
}

export { FileDropzone };
