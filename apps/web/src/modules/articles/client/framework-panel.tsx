"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { request } from "./request";

export type Framework = {
  name: string;
  titlePattern: string;
  hook: { type: string; technique: string };
  slots: { id: string; name: string; purpose: string; technique: string }[];
  rhythm: string;
  ending: { type: string; technique: string };
};

/** "框架 · 名称 · N 段"; links back to the breakdown while its reference exists. */
export function FrameworkTag({
  framework,
  referenceArticleId,
}: {
  framework: Framework;
  referenceArticleId: string | null;
}) {
  const label = `框架 · ${framework.name} · ${framework.slots.length} 段`;
  const slots = framework.slots
    .map((slot, index) => `${index + 1}. ${slot.name}`)
    .join("\n");
  return referenceArticleId ? (
    <Badge
      variant="secondary"
      title={slots}
      render={<Link href={`/breakdowns?id=${referenceArticleId}`} />}
    >
      {label}
    </Badge>
  ) : (
    <Badge
      variant="secondary"
      title={`${slots}\n参考文章已删除，框架结构仍保留。`}
    >
      {label}
    </Badge>
  );
}

// The snapshot of a deleted reference cannot be re-bound, only kept or removed.
const KEPT = "kept";

type Reference = {
  id: string;
  title: string;
  breakdownId: string | null;
};

/**
 * Binds one of the author's breakdowns to the article, or removes the binding.
 * Either change discards the outline, which was planned for the old structure.
 */
export function FrameworkPicker({
  articleId,
  version,
  breakdownId,
  hasFramework,
  hasOutline,
  disabled,
  onChanged,
  onError,
}: {
  articleId: string;
  version: number;
  breakdownId: string | null;
  /** True also when the reference was deleted and only the snapshot remains. */
  hasFramework: boolean;
  hasOutline: boolean;
  disabled: boolean;
  onChanged: (notice: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const current = breakdownId ?? (hasFramework ? KEPT : "");
  const [choices, setChoices] = useState<Reference[] | null>(null);
  const [choice, setChoice] = useState(current);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void request<{ references: Reference[] }>("/breakdowns")
      .then((response) =>
        setChoices(response.references.filter((item) => item.breakdownId)),
      )
      .catch(() => setChoices([]));
  }, []);
  useEffect(() => setChoice(current), [current]);

  async function apply() {
    setPending(true);
    try {
      await request(`/articles/${articleId}/framework`, {
        method: "PUT",
        body: JSON.stringify({
          expectedVersion: version,
          breakdownId: choice || null,
        }),
      });
      await onChanged(
        choice
          ? "已使用这个框架；请按框架重新生成大纲。"
          : "已不再使用框架；请重新生成或编写大纲。",
      );
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "修改框架失败。");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>写作框架</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          可以借用一篇已拆解文章的结构，大纲会按它的段落槽位生成；论据仍只来自本文的素材。
        </p>
        {choices !== null && choices.length === 0 && !hasFramework ? (
          <p className="text-sm text-muted-foreground">
            还没有拆解结果。
            <Link href="/breakdowns" className="text-primary underline">
              先去拆解一篇
            </Link>
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <select
              aria-label="选择框架"
              className="h-9 min-w-0 max-w-full rounded-md border bg-background px-2 text-sm"
              value={choice}
              onChange={(event) => setChoice(event.target.value)}
            >
              <option value="">不使用框架</option>
              {current === KEPT && (
                <option value={KEPT}>当前框架（参考文章已删除）</option>
              )}
              {breakdownId &&
                !choices?.some((item) => item.breakdownId === breakdownId) && (
                  <option value={breakdownId}>当前框架（旧版本拆解）</option>
                )}
              {choices?.map((item) => (
                <option key={item.id} value={item.breakdownId ?? ""}>
                  {item.title}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              disabled={disabled || pending || choice === current}
              onClick={() => void apply()}
            >
              {pending ? "保存中…" : "应用"}
            </Button>
          </div>
        )}
        {hasOutline && (
          <p className="text-xs text-muted-foreground">
            更换或取消框架会清除当前大纲及确认状态。
          </p>
        )}
      </CardContent>
    </Card>
  );
}
