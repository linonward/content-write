"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { StatusPill } from "@/components/ui/status-pill";

type Article = {
  updatedAt: string;
  id: string;
  workingTitle: string;
  audience: string;
  hasOutline: boolean;
  outlineConfirmedAt: string | null;
};
const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function ArticleList() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void fetch(`${apiBase}/api/articles`, { credentials: "include" })
      .then(async (response) => {
        const payload = (await response.json()) as {
          articles?: Article[];
          error?: { message?: string };
        };
        if (!response.ok)
          throw new Error(payload.error?.message ?? "加载文章失败。");
        if (live) setArticles(payload.articles ?? []);
      })
      .catch((cause: unknown) => {
        if (live)
          setError(cause instanceof Error ? cause.message : "加载文章失败。");
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);
  if (loading)
    return (
      <p role="status" className="text-body text-ink-2">
        加载中…
      </p>
    );
  if (error)
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  if (!articles.length)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>还没有文章</EmptyTitle>
          <EmptyDescription>
            从自己的素材生成选题，再开始写一篇文章。
          </EmptyDescription>
        </EmptyHeader>
        <Link
          href="/ideas"
          className={buttonVariants({ variant: "secondary" })}
        >
          从选题创建文章
        </Link>
      </Empty>
    );
  return (
    <div className="overflow-hidden rounded-md border bg-surface">
      <div className="flex items-center gap-4 border-b px-6 py-3 text-label text-ink-2 max-sm:hidden">
        <span className="flex-1">标题</span>
        <span className="w-28">阶段</span>
        <span className="w-28">更新时间</span>
      </div>
      <ul aria-label="文章列表">
        {articles.map((article) => (
          <li key={article.id} className="border-b last:border-b-0">
            <Link
              href={`/articles/${article.id}`}
              className="flex min-h-16 items-center gap-4 px-6 py-2 transition-colors hover:bg-sunken max-sm:flex-wrap max-sm:px-4"
            >
              <span className="grid min-w-0 flex-1 gap-1 max-sm:basis-full">
                <strong className="text-title-card wrap-anywhere">
                  {article.workingTitle}
                </strong>
                <span className="text-meta text-ink-2">
                  面向：{article.audience}
                </span>
              </span>
              <span className="w-28">
                <StatusPill
                  tone={article.outlineConfirmedAt ? "done" : "pending"}
                >
                  {article.outlineConfirmedAt
                    ? "大纲已确认"
                    : article.hasOutline
                      ? "大纲待确认"
                      : "待生成大纲"}
                </StatusPill>
              </span>
              <time
                dateTime={article.updatedAt}
                className="w-28 text-meta text-ink-2"
              >
                {new Date(article.updatedAt).toLocaleDateString("zh-CN")}
              </time>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
