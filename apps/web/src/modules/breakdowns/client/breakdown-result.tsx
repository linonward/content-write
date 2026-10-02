"use client";

import { LockKeyhole } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
      <h4 className="text-xs text-ink-2">{label}</h4>
      <div className="text-body">{children}</div>
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
  const original = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (!active) return;
    original.current?.querySelector("mark")?.scrollIntoView({
      block: "nearest",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }, [active]);
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
      "grid w-full gap-1 rounded-sm border-l-2 border-l-transparent px-3 py-3 text-left transition-colors hover:bg-sunken",
      active === key &&
        "border-l-accent bg-evidence-soft hover:bg-evidence-soft",
    );

  return (
    <div className="grid grid-cols-2 gap-6 max-xl:grid-cols-1">
      <section aria-label="原文" className="min-w-0">
        <p className="flex items-center gap-2 pb-4 text-label text-ink-2">
          <LockKeyhole className="size-3.5" aria-hidden="true" />
          原文 · 仅你可见，不会进入你的稿子
        </p>
        <div
          ref={original}
          className="max-h-180 overflow-y-auto p-0 font-serif text-reading whitespace-pre-wrap wrap-anywhere"
        >
          {segments(content, marked).map((part) =>
            part.marked ? (
              <mark
                key={part.key}
                className="rounded-xs bg-evidence-soft px-0.5"
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
        className="grid min-w-0 content-start gap-5 rounded-sm bg-sunken p-4"
      >
        <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
          <Section label="标题类型">{result.titlePattern}</Section>
          <Section label="目标读者">{result.audience}</Section>
          <Section label="节奏">{result.rhythm}</Section>
        </div>
        <button
          type="button"
          className={choice("hook")}
          aria-pressed={active === "hook"}
          onClick={() => select("hook")}
        >
          <span className="text-xs text-ink-2">
            开头钩子 · {evidenceLabel(result.hook.spanIds)}
          </span>
          <strong className="pt-1 block text-sm">{result.hook.type}</strong>
          <span className="pt-1 block text-sm text-ink-2">
            {result.hook.technique}
          </span>
        </button>
        <div>
          <h4 className="pb-2 text-xs text-ink-2">
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
                    <strong className="flex items-center gap-2 text-title-card">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-evidence-soft text-label text-evidence-ink">
                        {index + 1}
                      </span>
                      {slot.name}
                    </strong>
                    <span className="shrink-0 text-xs text-ink-2">
                      {evidenceLabel(slot.spanIds)}
                    </span>
                  </span>
                  <span className="pt-1 block text-sm">{slot.purpose}</span>
                  <span className="pt-1 block text-sm text-ink-2">
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
          aria-pressed={active === "ending"}
          onClick={() => select("ending")}
        >
          <span className="text-xs text-ink-2">
            结尾方式 · {evidenceLabel(result.ending.spanIds)}
          </span>
          <strong className="pt-1 block text-sm">{result.ending.type}</strong>
          <span className="pt-1 block text-sm text-ink-2">
            {result.ending.technique}
          </span>
        </button>
        <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
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
        <p className="text-xs text-ink-2">
          拆解只提取结构与写法，不预测阅读量；原文不会进入大纲、初稿或导出。
        </p>
      </section>
    </div>
  );
}
