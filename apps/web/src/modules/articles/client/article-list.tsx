"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Article = {
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
  if (loading) return <p>加载中…</p>;
  if (error)
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  if (!articles.length)
    return (
      <p className="text-muted-foreground">还没有文章。先从选题创建一篇。</p>
    );
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {articles.map((article) => (
        <Card key={article.id}>
          <CardHeader>
            <CardTitle>
              <Link
                href={`/articles/${article.id}`}
                className="hover:underline"
              >
                {article.workingTitle}
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              面向：{article.audience}
            </p>
            <Badge variant="secondary">
              {article.outlineConfirmedAt
                ? "大纲已确认"
                : article.hasOutline
                  ? "大纲待确认"
                  : "待生成大纲"}
            </Badge>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
