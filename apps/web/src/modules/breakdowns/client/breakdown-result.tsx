"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export type Span = { id: string; quote: string; start: number; end: number };
type Move = { type: string; technique: string; spanIds: string[] };
export type Breakdown = {
  titlePattern: string;
  audience: string;
  hook: Move;
  slots: {
    id: string;
    name: string;
    purpose: string;
    technique: string;
    spanIds: string[];
  }[];
  rhythm: string;
  ending: Move;
  whyItWorks: string[];
  limitations: string[];
  spans: Span[];
};

/** Splits the original into plain and highlighted parts for the active spans. */
function segments(content: string, spans: Span[]) {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const parts: { text: string; marked: boolean; key: string }[] = [];
  let at = 0;
  for (const span of sorted) {
    if (span.start < at) continue;
    if (span.start > at)
      parts.push({
        text: content.slice(at, span.start),
        marked: false,
        key: `t${at}`,
      });
    parts.push({
      text: content.slice(span.start, span.end),
      marked: true,
      key: span.id,
    });
    at = span.end;
  }
  if (at < content.length)
    parts.push({ text: content.slice(at), marked: false, key: `t${at}` });
  return parts;
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1">
      <h4 className="text-xs text-muted-foreground">{label}</h4>
      <div className="text-sm leading-[1.7]">{children}</div>
    </div>
  );
}

/**
 * Structure on one side, the original on the other. Choosing a part of the
 * structure highlights the passages it was drawn from; the original stays here.
 */
export function BreakdownResult({
  content,
  result,
}: {
  content: string;
  result: Breakdown;
}) {
  const [active, setActive] = useState<string | null>(null);
  const parts: { key: string; spanIds: string[] }[] = [
    { key: "hook", spanIds: result.hook.spanIds },
    ...result.slots.map((slot) => ({ key: slot.id, spanIds: slot.spanIds })),
    { key: "ending", spanIds: result.ending.spanIds },
  ];
  const activeIds = new Set(
    parts.find((part) => part.key === active)?.spanIds ?? [],
  );
  const marked = result.spans.filter((span) => activeIds.has(span.id));
  const select = (key: string) => setActive(active === key ? null : key);
  const evidenceLabel = (ids: string[]) =>
    ids.length ? `${ids.length} 处原文` : "无对照片段";
  const choice = (key: string) =>
    cn(
      "w-full rounded-md border px-3 py-2.5 text-left transition-colors hover:bg-muted",
      active === key && "border-primary bg-secondary",
    );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6 max-[960px]:grid-cols-1">
      <section aria-label="原文" className="min-w-0">
        <p className="mb-3 text-xs text-muted-foreground">
          原文 · 仅你可见，不会进入你的稿子
        </p>
        <div className="max-h-[720px] overflow-y-auto rounded-md border bg-muted/30 p-4 whitespace-pre-wrap wrap-anywhere leading-[1.8]">
          {segments(content, marked).map((part) =>
            part.marked ? (
              <mark
                key={part.key}
                className="rounded-sm bg-amber-200/70 px-0.5"
              >
                {part.text}
              </mark>
            ) : (
              <span key={part.key}>{part.text}</span>
            ),
          )}
        </div>
      </section>
      <section
        aria-label="拆解结果"
        className="grid min-w-0 content-start gap-5"
      >
        <div className="grid grid-cols-2 gap-4 max-[520px]:grid-cols-1">
          <Section label="标题类型">{result.titlePattern}</Section>
          <Section label="目标读者">{result.audience}</Section>
          <Section label="节奏">{result.rhythm}</Section>
        </div>
        <button
          type="button"
          className={choice("hook")}
          onClick={() => select("hook")}
        >
          <span className="text-xs text-muted-foreground">
            开头钩子 · {evidenceLabel(result.hook.spanIds)}
          </span>
          <strong className="mt-1 block text-sm">{result.hook.type}</strong>
          <span className="mt-1 block text-sm text-muted-foreground">
            {result.hook.technique}
          </span>
        </button>
        <div>
          <h4 className="mb-2 text-xs text-muted-foreground">
            段落槽位 · {result.slots.length} 段
          </h4>
          <ol className="grid gap-2">
            {result.slots.map((slot, index) => (
              <li key={slot.id}>
                <button
                  type="button"
                  className={choice(slot.id)}
                  aria-pressed={active === slot.id}
                  onClick={() => select(slot.id)}
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <strong className="text-sm">
                      {index + 1}. {slot.name}
                    </strong>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {evidenceLabel(slot.spanIds)}
                    </span>
                  </span>
                  <span className="mt-1 block text-sm">{slot.purpose}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    手法：{slot.technique}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
        <button
          type="button"
          className={choice("ending")}
          onClick={() => select("ending")}
        >
          <span className="text-xs text-muted-foreground">
            结尾方式 · {evidenceLabel(result.ending.spanIds)}
          </span>
          <strong className="mt-1 block text-sm">{result.ending.type}</strong>
          <span className="mt-1 block text-sm text-muted-foreground">
            {result.ending.technique}
          </span>
        </button>
        <div className="grid grid-cols-2 gap-4 max-[520px]:grid-cols-1">
          <Section label="为什么有效">
            <ul className="list-disc space-y-1 pl-4">
              {result.whyItWorks.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Section>
          <Section label="局限">
            <ul className="list-disc space-y-1 pl-4">
              {result.limitations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Section>
        </div>
        <p className="text-xs text-muted-foreground">
          拆解只提取结构与写法，不预测阅读量；原文不会进入大纲、初稿或导出。
        </p>
      </section>
    </div>
  );
}
