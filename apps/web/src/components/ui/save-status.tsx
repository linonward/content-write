import { cn } from "@/lib/utils";

export type SaveState = "saved" | "saving" | "failed";

const labels: Record<SaveState, string> = {
  saved: "已保存",
  saving: "保存中…",
  failed: "保存失败",
};

// 保存状态：固定宽度的 meta 文本，状态切换不改变布局。
function SaveStatus({
  state,
  className,
}: {
  state: SaveState;
  className?: string;
}) {
  return (
    <span
      role="status"
      data-state={state}
      className={cn(
        "inline-block w-16 text-meta text-ink-2 tabular-nums data-[state=failed]:text-danger",
        className,
      )}
    >
      {labels[state]}
    </span>
  );
}

export { SaveStatus };
