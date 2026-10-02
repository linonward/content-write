"use client";

import { ExternalLink, Send } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatLocalTime, parseLocalTime } from "./publish-time";
import { RequestError, request } from "./request";

type PublishRecord = {
  id: string;
  url: string;
  publishedAt: string;
  articleVersion: number;
  createdAt: string;
};
type Listing = {
  articleVersion: number;
  hasBody: boolean;
  records: PublishRecord[];
};

const panel =
  "flex flex-col gap-4 rounded-md border border-line bg-surface p-6";

// T031 replaces step 1 with the draft push; until then nothing here suggests it exists.
const steps = (articleId: string) => [
  {
    title: "导出并粘贴到公众号后台",
    body: "在预览页下载 HTML，或复制正文，粘贴到公众号后台的编辑器。",
    action: (
      <Link
        href={`/articles/${articleId}/preview`}
        className={buttonVariants({ variant: "secondary", size: "sm" })}
      >
        去预览与导出
      </Link>
    ),
  },
  {
    title: "在公众号后台检查并发布",
    body: "图片与样式以后台预览为准；发布由你完成。",
  },
  {
    title: "发布后回到这里记录链接",
    body: "记录绑定文章版本，方便以后回看。",
  },
];

/**
 * Manual publishing: the steps to publish in the WeChat backend, and records
 * of the links the author publishes there. A record means "the author marked
 * this as published"; nothing confirms it with the platform.
 */
export function PublishWorkspace({ articleId }: { articleId: string }) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [loadError, setLoadError] = useState<RequestError | null>(null);
  const [url, setUrl] = useState("");
  const [time, setTime] = useState(() => formatLocalTime(new Date()));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setListing(
        await request<Listing>(`/articles/${articleId}/publish-records`),
      );
      setLoadError(null);
    } catch (cause) {
      setLoadError(
        cause instanceof RequestError
          ? cause
          : new RequestError("发布记录载入失败。", 500),
      );
    }
  }, [articleId]);
  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!listing || pending) return;
    setError("");
    setNotice("");
    const publishedAt = parseLocalTime(time);
    if (!/^https?:\/\//i.test(url.trim())) {
      setError("请填写以 http:// 或 https:// 开头的发布链接。");
      return;
    }
    if (!publishedAt) {
      setError("发布时间格式应为 2026/10/02 20:30。");
      return;
    }
    setPending(true);
    try {
      await request(`/articles/${articleId}/publish-records`, {
        method: "POST",
        body: JSON.stringify({
          expectedVersion: listing.articleVersion,
          url: url.trim(),
          publishedAt: publishedAt.toISOString(),
        }),
      });
      setUrl("");
      setNotice(`已记录，绑定文章版本 ${listing.articleVersion}。`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败。");
      // A newer version means the form showed a stale one; show the current one.
      if (cause instanceof RequestError && cause.status === 409) await load();
    } finally {
      setPending(false);
    }
  }

  async function remove(record: PublishRecord) {
    setPending(true);
    setError("");
    setNotice("");
    try {
      await request(`/articles/${articleId}/publish-records/${record.id}`, {
        method: "DELETE",
      });
      setNotice("已删除这条发布记录，文章未改动。");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除失败。");
    } finally {
      setPending(false);
    }
  }

  if (loadError)
    return (
      <Alert variant="destructive">
        <AlertDescription className="flex flex-col items-start gap-3">
          <p>
            {loadError.status === 404
              ? "文章不存在，或你没有访问权限。"
              : loadError.message}
          </p>
          {loadError.status === 404 ? (
            <Link
              href="/articles"
              className={buttonVariants({ variant: "secondary" })}
            >
              返回文章列表
            </Link>
          ) : (
            <Button variant="secondary" onClick={() => void load()}>
              重试
            </Button>
          )}
        </AlertDescription>
      </Alert>
    );
  if (!listing)
    return <p className="py-16 text-center text-body text-ink-2">正在载入…</p>;

  return (
    <div className="flex items-start gap-6 max-lg:flex-col max-lg:items-stretch">
      <section aria-labelledby="steps-title" className={`${panel} flex-1`}>
        <h2 id="steps-title" className="text-title-card">
          手动发布步骤
        </h2>
        <ol className="flex flex-col gap-4">
          {steps(articleId).map((step, index) => (
            <li key={step.title} className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-meta text-accent tabular-nums">
                {index + 1}
              </span>
              <div className="flex flex-col items-start gap-2">
                <h3 className="text-label text-ink">{step.title}</h3>
                <p className="text-body text-ink-2">{step.body}</p>
                {step.action}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <div className="flex w-130 shrink-0 flex-col gap-6 max-lg:w-full">
        <section aria-labelledby="record-title" className={panel}>
          <h2 id="record-title" className="text-title-card">
            记录发布
          </h2>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {notice && (
            <Alert variant="success" role="status">
              <AlertDescription>{notice}</AlertDescription>
            </Alert>
          )}
          {listing.hasBody ? (
            <form
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="publish-url">发布链接</Label>
                <Input
                  id="publish-url"
                  type="url"
                  inputMode="url"
                  value={url}
                  maxLength={2000}
                  placeholder="https://mp.weixin.qq.com/s/..."
                  onChange={(event) => setUrl(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="publish-time">发布时间</Label>
                <Input
                  id="publish-time"
                  value={time}
                  placeholder="2026/10/02 20:30"
                  onChange={(event) => setTime(event.target.value)}
                />
              </div>
              <p className="text-meta text-ink-2 tabular-nums">
                对应文章版本：v{listing.articleVersion}（当前）
              </p>
              <Button
                type="submit"
                className="self-start"
                disabled={pending || !url.trim()}
              >
                保存记录
              </Button>
            </form>
          ) : (
            <p className="text-body text-ink-2">
              文章还没有正文。写好正文、在公众号后台发布后，再回来记录链接。
            </p>
          )}
        </section>

        <section aria-labelledby="history-title" className={panel}>
          <h2 id="history-title" className="text-title-card">
            历史记录
          </h2>
          {listing.records.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <Send aria-hidden className="size-4.5 text-ink-3" />
              <p className="text-title-card">还没有发布记录</p>
              <p className="text-body text-ink-2">
                在公众号后台发布后，在上方记录链接。
              </p>
            </div>
          ) : (
            <ul className="flex flex-col">
              {listing.records.map((record) => (
                <li
                  key={record.id}
                  className="flex items-start justify-between gap-3 border-t border-line py-3 first:border-t-0 first:pt-0"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <a
                      href={record.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="flex min-w-0 items-center gap-1.5 text-label text-accent hover:underline"
                    >
                      <span className="truncate">{record.url}</span>
                      <ExternalLink aria-hidden className="size-3.5 shrink-0" />
                    </a>
                    <p className="text-meta text-ink-2 tabular-nums">
                      用户标记已发布 ·{" "}
                      {formatLocalTime(new Date(record.publishedAt))} · 版本{" "}
                      {record.articleVersion}
                    </p>
                    {record.articleVersion < listing.articleVersion && (
                      <p className="text-meta text-evidence-ink">
                        文章之后已更新到版本 {listing.articleVersion}。
                      </p>
                    )}
                  </div>
                  <AlertDialog
                    open={confirming === record.id}
                    onOpenChange={(next) =>
                      setConfirming(next ? record.id : null)
                    }
                  >
                    <AlertDialogTrigger
                      render={
                        <Button variant="ghost" size="sm" disabled={pending}>
                          删除
                        </Button>
                      }
                    />
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>删除这条发布记录？</AlertDialogTitle>
                        <AlertDialogDescription>
                          只删除这里的记录，不影响文章，也不会影响公众号上已发布的内容。
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction
                          variant="danger-solid"
                          disabled={pending}
                          onClick={() => {
                            setConfirming(null);
                            void remove(record);
                          }}
                        >
                          删除记录
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
