import { Badge } from "@/components/ui/badge";

// docs/design-system.md 第 4 节“状态胶囊”的五种状态。
export type StatusTone =
  | "pending"
  | "processing"
  | "done"
  | "expired"
  | "failed";

const variants = {
  pending: "neutral",
  processing: "muted",
  done: "accent",
  expired: "evidence",
  failed: "danger",
} as const;

function StatusPill({
  tone,
  children,
}: {
  tone: StatusTone;
  children: React.ReactNode;
}) {
  return (
    <Badge variant={variants[tone]} data-tone={tone}>
      {tone === "processing" && (
        <span
          aria-hidden
          className="size-1.5 rounded-full bg-ink-2 motion-safe:animate-pulse"
        />
      )}
      {children}
    </Badge>
  );
}

export { StatusPill };
