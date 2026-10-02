"use client";

import { ChevronRight, Info } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import styles from "./article-preview.module.css";
import { RequestError, request } from "./request";

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type Preview = {
  articleId: string;
  version: number;
  title: string;
  /** Sanitized by the API's rendering chain; the same fragment goes into the HTML export. */
  html: string;
  fileName: string;
  renderedAt: string;
};
type Format = "html" | "markdown";
type State =
  | { kind: "loading" }
  | { kind: "ready"; preview: Preview }
  | { kind: "failed"; error: RequestError };

const formats: Record<Format, { label: string; extension: string }> = {
  html: { label: "HTML", extension: "html" },
  markdown: { label: "Markdown", extension: "md" },
};

/** Fetches the export with the session cookie and saves it, so failures stay on this page. */
async function download(articleId: string, format: Format, fileName: string) {
  let response: Response;
  try {
    response = await fetch(
      `${apiBase}/api/articles/${articleId}/export?format=${format}`,
      { credentials: "include" },
    );
  } catch {
    throw new RequestError("网络连接失败，请检查网络后重试。", 0);
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string };
    };
    throw new RequestError(
      payload.error?.message ?? "导出失败，请稍后重试。",
      response.status,
      payload.error?.code,
    );
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = `${fileName}.${formats[format].extension}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const time = (value: string) =>
  new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

/** About 375px phone preview of the current article, with Markdown and HTML downloads. */
export function ArticlePreview({ id }: { id: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [pending, setPending] = useState<Format | null>(null);
  const [downloadError, setDownloadError] = useState("");

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const preview = await request<Preview>(`/articles/${id}/preview`);
      setState({ kind: "ready", preview });
    } catch (error) {
      setState({
        kind: "failed",
        error:
          error instanceof RequestError
            ? error
            : new RequestError("预览失败，请稍后重试。", 500),
      });
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  async function save(format: Format, fileName: string) {
    setPending(format);
    setDownloadError("");
    try {
      await download(id, format, fileName);
    } catch (error) {
      setDownloadError(
        error instanceof RequestError
          ? error.message
          : "导出失败，请稍后重试。",
      );
    } finally {
      setPending(null);
    }
  }

  const preview = state.kind === "ready" ? state.preview : null;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pt-10 pb-4 max-md:pt-8">
        <nav
          aria-label="面包屑"
          className="flex min-w-0 items-center gap-1.5 text-sm text-ink-2"
        >
          <Link href="/articles" className="shrink-0 hover:text-ink">
            文章
          </Link>
          <ChevronRight aria-hidden className="size-3.5 shrink-0" />
          <Link
            href={`/articles/${id}`}
            className="truncate font-medium text-ink hover:underline"
          >
            {preview?.title ?? "文章"}
          </Link>
          <span className="shrink-0">· 预览</span>
        </nav>
        <div className="flex items-center gap-3">
          {preview && (
            <span className="text-xs text-ink-2">版本 {preview.version}</span>
          )}
          <Link
            className={cn(buttonVariants({ variant: "secondary" }))}
            href={`/articles/${id}`}
          >
            返回编辑
          </Link>
        </div>
      </div>

      {state.kind === "loading" && (
        <p className="py-16 text-center text-sm text-ink-2">正在渲染预览…</p>
      )}
      {state.kind === "failed" && (
        <Alert
          variant={state.error.status === 422 ? "default" : "destructive"}
          className="mt-8"
        >
          <AlertDescription className="space-y-3">
            <p>
              {state.error.status === 404
                ? "文章不存在，或你没有访问权限。"
                : state.error.message}
            </p>
            {state.error.status === 422 ? (
              <Link
                className={cn(buttonVariants({ variant: "secondary" }))}
                href={`/articles/${id}`}
              >
                去写正文
              </Link>
            ) : state.error.status === 404 ? (
              <Link
                className={cn(buttonVariants({ variant: "secondary" }))}
                href="/articles"
              >
                返回文章列表
              </Link>
            ) : (
              <Button
                type="button"
                variant="secondary"
                onClick={() => void load()}
              >
                重试
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {preview && (
        <div className="flex items-start justify-center gap-12 pt-8 max-lg:flex-col max-lg:items-stretch max-lg:gap-6">
          <aside className="flex w-75 shrink-0 flex-col gap-4 max-lg:w-full">
            <section
              aria-labelledby="export-title"
              className="flex flex-col gap-3 rounded-md border border-line bg-surface p-6"
            >
              <h2 id="export-title" className="text-title-card">
                导出
              </h2>
              <p className="text-label font-normal text-ink-2">
                预览与导出共用同一条安全渲染链：脚本、事件属性、iframe
                和不安全链接会被移除，图片不自动加载，只保留为链接。
              </p>
              {(Object.keys(formats) as Format[]).map((format) => (
                <Button
                  key={format}
                  type="button"
                  size="lg"
                  className="w-full"
                  variant={format === "html" ? "primary" : "secondary"}
                  disabled={pending !== null}
                  onClick={() => void save(format, preview.fileName)}
                >
                  {pending === format
                    ? "正在导出…"
                    : `下载 ${formats[format].label}`}
                </Button>
              ))}
              {downloadError && (
                <p role="alert" className="text-label text-danger">
                  {downloadError}
                </p>
              )}
            </section>
            <p className="flex gap-2 rounded-sm bg-evidence-soft px-4 py-3 text-label font-normal text-evidence-ink">
              <Info aria-hidden className="size-3.5 shrink-0 translate-y-0.5" />
              基础预览，微信编辑器可能调整最终样式。
            </p>
            <p className="text-meta text-ink-2 tabular-nums">
              版本 {preview.version} · {time(preview.renderedAt)} 渲染
            </p>
          </aside>

          <section
            aria-label="手机预览"
            data-testid="phone-preview"
            className="w-phone max-w-full shrink-0 overflow-hidden rounded-device border border-line-strong bg-surface max-lg:self-center"
          >
            <div className="flex h-11 items-center justify-center border-b border-line text-meta text-ink-2">
              公众号文章预览 · 375px
            </div>
            <article className="p-6">
              <h1 className={styles.title}>{preview.title}</h1>
              <div
                className={styles.content}
                // biome-ignore lint/security/noDangerouslySetInnerHtml: the API renders through remark/rehype with an allow-list sanitizer (no raw HTML, scripts, event attributes, iframes, images or unsafe URLs).
                dangerouslySetInnerHTML={{ __html: preview.html }}
              />
            </article>
          </section>
        </div>
      )}
    </>
  );
}
