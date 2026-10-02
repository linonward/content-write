"use client";

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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { StatusPill, type StatusTone } from "@/components/ui/status-pill";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { AiConsentNotice } from "@/modules/ai/client/ai-consent-notice";
import { type AiMode, modeLabel, modeNote } from "@/modules/ai/client/ai-mode";
import { request } from "@/modules/articles/client/request";
import { AppPage } from "@/modules/shell/client/app-shell";
import { useUnsavedChanges } from "@/modules/shell/client/unsaved-changes";
import { type Breakdown, BreakdownResult } from "./breakdown-result";
import { FrameworkDialog } from "./framework-dialog";

type Status = "unprocessed" | "processing" | "failed" | "done";
type Summary = {
  id: string;
  title: string;
  sourceUrl: string | null;
  fetchStatus: string | null;
  currentVersion: number;
  contentLength: number;
  status: Status;
  updatedAt: string;
};
type Detail = {
  reference: Summary & { content: string };
  breakdown: {
    id: string;
    referenceVersion: number;
    mode: string;
    result: Breakdown;
    createdAt: string;
  } | null;
  latestJob: { id: string; status: string; errorCode: string | null } | null;
  processingAvailable: boolean;
  aiMode: AiMode;
};

const MAX_CHARS = 50_000;
const statusLabels: Record<Status, string> = {
  unprocessed: "未拆解",
  processing: "拆解中",
  failed: "失败",
  done: "已拆解",
};
const message = (cause: unknown, fallback: string) =>
  cause instanceof Error ? cause.message : fallback;
const date = (value: string) =>
  new Date(value).toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  });

function origin(item: Summary) {
  if (!item.sourceUrl) return "粘贴正文";
  const host = new URL(item.sourceUrl).hostname;
  if (item.contentLength === 0)
    return item.fetchStatus === "failed"
      ? "链接抓取失败"
      : `${host} · 待粘贴正文`;
  return host;
}

const statusTones: Record<Status, StatusTone> = {
  unprocessed: "pending",
  processing: "processing",
  failed: "failed",
  done: "done",
};

function StatusBadge({ item }: { item: Summary }) {
  if (item.contentLength === 0)
    return <StatusPill tone="pending">待粘贴正文</StatusPill>;
  return (
    <StatusPill tone={statusTones[item.status]}>
      {statusLabels[item.status]}
    </StatusPill>
  );
}

export function BreakdownWorkspace() {
  const [items, setItems] = useState<Summary[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [selected, setSelected] = useState<Detail | null>(null);
  const [mode, setMode] = useState<"create" | "view" | "edit">("view");
  const [createOpen, setCreateOpen] = useState(false);
  const [source, setSource] = useState<"text" | "link">("text");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [fetchText, setFetchText] = useState(true);
  const [remoteFetch, setRemoteFetch] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [frameworkOpen, setFrameworkOpen] = useState(false);
  useUnsavedChanges(
    mode === "create"
      ? !!(title || content || url)
      : mode === "edit" &&
          !!selected &&
          (title !== selected.reference.title ||
            content !== selected.reference.content),
  );

  const refresh = useCallback(async () => {
    const response = await request<{ references: Summary[]; hasMore: boolean }>(
      "/breakdowns",
    );
    setItems(response.references);
    setHasMore(response.hasMore);
    setListError("");
  }, []);

  const open = useCallback(async (id: string) => {
    setError("");
    setNotice("");
    try {
      const detail = await request<Detail>(`/breakdowns/${id}`);
      setSelected(detail);
      setMode("view");
      const job = detail.latestJob;
      setJobId(
        job && ["queued", "running"].includes(job.status) ? job.id : null,
      );
      if (job?.status === "failed" && !detail.breakdown)
        setError("上次拆解失败，可以重新拆解。");
    } catch (cause) {
      setError(message(cause, "加载失败。"));
    }
  }, []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("new") === "1") {
      setMode("create");
      setCreateOpen(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    void refresh()
      .catch((cause: unknown) => setListError(message(cause, "加载失败。")))
      .finally(() => setLoading(false));
    void request<{ remoteFetchEnabled: boolean }>(
      "/materials/link-capabilities",
    )
      .then((value) => setRemoteFetch(value.remoteFetchEnabled))
      .catch(() => setRemoteFetch(false));
    // An article's framework tag links back here with the reference to open.
    const linked = new URLSearchParams(window.location.search).get("id");
    if (linked) void open(linked);
  }, [refresh, open]);

  const selectedId = selected?.reference.id;
  useEffect(() => {
    if (!jobId || !selectedId) return;
    let live = true;
    const timer = setInterval(() => {
      void request<{ job: { status: string } }>(`/jobs/${jobId}`)
        .then(async (response) => {
          if (!live || ["queued", "running"].includes(response.job.status))
            return;
          setJobId(null);
          setCreateOpen(false);
          await open(selectedId);
          await refresh();
          if (response.job.status === "failed")
            setError("拆解失败，可以重新拆解。");
          if (response.job.status === "stale")
            setError("原文已修改，请重新拆解当前版本。");
        })
        .catch((cause: unknown) => {
          if (live) setError(message(cause, "任务状态获取失败。"));
        });
    }, 1500);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [jobId, selectedId, open, refresh]);

  function startCreate() {
    setSelected(null);
    setMode("create");
    setCreateOpen(true);
    setTitle("");
    setContent("");
    setUrl("");
    setError("");
    setNotice("");
    setJobId(null);
  }

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const body =
        source === "text"
          ? { content, ...(title.trim() ? { title } : {}) }
          : { url, fetch: remoteFetch && fetchText };
      const created = await request<{ id: string; fetchStatus?: string }>(
        "/breakdowns",
        { method: "POST", body: JSON.stringify(body) },
      );
      await refresh();
      setCreateOpen(false);
      await open(created.id);
      if (created.fetchStatus === "failed")
        setNotice("链接已保存，但没有抓取到正文。请打开原文复制正文后粘贴。");
      else if (created.fetchStatus === "disabled")
        setNotice("链接已保存。请复制文章正文后粘贴，再拆解。");
    } catch (cause) {
      setError(message(cause, "保存失败。"));
    } finally {
      setPending(false);
    }
  }

  async function saveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setPending(true);
    setError("");
    try {
      await request<{ version: number }>(
        `/breakdowns/${selected.reference.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            expectedVersion: selected.reference.currentVersion,
            title,
            content,
          }),
        },
      );
      await refresh();
      setCreateOpen(false);
      await open(selected.reference.id);
    } catch (cause) {
      setError(message(cause, "保存失败。"));
    } finally {
      setPending(false);
    }
  }

  async function breakDown() {
    if (!selected) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      const started = await request<{ jobId: string }>(
        `/breakdowns/${selected.reference.id}/process`,
        {
          method: "POST",
          headers: { "idempotency-key": crypto.randomUUID() },
          body: JSON.stringify({
            expectedVersion: selected.reference.currentVersion,
          }),
        },
      );
      setJobId(started.jobId);
      await refresh();
    } catch (cause) {
      setError(message(cause, "拆解失败。"));
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!selected) return;
    setPending(true);
    setError("");
    try {
      await request<void>(`/breakdowns/${selected.reference.id}`, {
        method: "DELETE",
      });
      await refresh();
      setSelected(null);
      setMode("view");
      setNotice("已删除参考文章、原文修订与拆解结果。");
    } catch (cause) {
      setError(message(cause, "删除失败。"));
    } finally {
      setPending(false);
    }
  }

  const reference = selected?.reference;
  const needsText = reference !== undefined && !reference.content.trim();

  return (
    <AppPage
      title="拆解"
      description="拆结构，用自己的素材写。"
      actions={<Button onClick={startCreate}>拆解一篇爆款</Button>}
    >
      {error && !createOpen && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert role="status">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      <section
        className="grid items-start gap-6 lg:grid-cols-4"
        aria-label="拆解"
      >
        <Card
          className={cn(
            "min-w-0 gap-3 overflow-hidden",
            reference && "max-md:hidden",
          )}
        >
          <CardHeader>
            <CardTitle>
              <h2>参考文章 · {items.length}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {listError && (
              <Alert variant="destructive" className="pb-4">
                <AlertDescription>
                  {listError}{" "}
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      void refresh().catch((cause: unknown) =>
                        setListError(message(cause, "加载失败。")),
                      )
                    }
                  >
                    重试
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            {loading ? (
              <p role="status" className="text-body text-ink-2">
                加载中…
              </p>
            ) : items.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>还没有参考文章</EmptyTitle>
                  <EmptyDescription>
                    贴入一篇你觉得写得好的文章，看看它是怎么搭起来的。
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ul>
                {items.map((item) => (
                  <li className="border-b last:border-b-0" key={item.id}>
                    <Button
                      type="button"
                      variant="ghost"
                      className={cn(
                        "h-auto min-h-16 w-full justify-between gap-3 rounded-none border-l-2 border-l-transparent px-3 py-2 text-left",
                        reference?.id === item.id &&
                          "border-l-accent bg-accent-soft hover:bg-accent-soft",
                      )}
                      onClick={() => void open(item.id)}
                    >
                      <span className="grid min-w-0 gap-1.5">
                        <strong className="truncate text-title-card">
                          {item.title}
                        </strong>
                        <span className="truncate text-xs text-ink-2">
                          {origin(item)} · {date(item.updatedAt)}
                        </span>
                      </span>
                      <StatusBadge item={item} />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {hasMore && (
              <p className="pt-3 text-xs text-ink-2">
                当前显示最近 100 篇参考文章。
              </p>
            )}
          </CardContent>
        </Card>

        <Card
          className={cn("min-w-0 lg:col-span-3", !reference && "max-md:hidden")}
        >
          <CardContent className="grid gap-5">
            {!reference && (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>选择一篇参考文章</EmptyTitle>
                  <EmptyDescription>
                    查看原文与写作框架；原文仅你可见。
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
            {reference && (
              <Button
                variant="ghost"
                className="justify-self-start md:hidden"
                onClick={() => {
                  setSelected(null);
                  setMode("view");
                }}
              >
                返回参考文章列表
              </Button>
            )}
            {mode === "edit" && reference && (
              <form
                className="grid gap-5"
                onSubmit={(event) => void saveEdit(event)}
              >
                <h2 className="text-title-section">
                  {needsText ? "粘贴正文" : "编辑原文"}
                </h2>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="reference-edit-title">标题</FieldLabel>
                    <Input
                      id="reference-edit-title"
                      value={title}
                      maxLength={200}
                      required
                      onChange={(event) => setTitle(event.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="reference-edit-content">
                      文章正文
                    </FieldLabel>
                    <Textarea
                      id="reference-edit-content"
                      value={content}
                      maxLength={MAX_CHARS}
                      rows={14}
                      required
                      onChange={(event) => setContent(event.target.value)}
                    />
                    <FieldDescription>
                      {content.length} / {MAX_CHARS}{" "}
                      字。保存后生成新版本，需重新拆解。
                    </FieldDescription>
                  </Field>
                </FieldGroup>
                <div className="flex gap-3">
                  <Button type="submit" disabled={pending}>
                    {pending ? "保存中…" : "保存"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setMode("view")}
                  >
                    取消
                  </Button>
                </div>
              </form>
            )}

            {mode === "view" && reference && selected && (
              <>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="text-title-section wrap-anywhere">
                      {reference.title}
                    </h2>
                    <p className="pt-1 text-xs text-ink-2">
                      参考文章 · 版本 {reference.currentVersion} ·{" "}
                      {reference.content.length.toLocaleString("zh-CN")} 字
                      {selected.breakdown &&
                        ` · ${modeLabel(selected.breakdown.mode)}于 ${new Date(selected.breakdown.createdAt).toLocaleString("zh-CN")}`}
                    </p>
                    {reference.sourceUrl && (
                      <a
                        className="pt-1 block truncate text-xs text-accent underline"
                        href={reference.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {reference.sourceUrl}
                      </a>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selected.breakdown && (
                      <Button
                        type="button"
                        disabled={pending}
                        onClick={() => setFrameworkOpen(true)}
                      >
                        用这个框架写
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={pending || jobId !== null}
                      onClick={() => {
                        setTitle(reference.title);
                        setContent(reference.content);
                        setError("");
                        setMode("edit");
                      }}
                    >
                      {needsText ? "粘贴正文" : "编辑原文"}
                    </Button>
                    <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                      <AlertDialogTrigger
                        render={<Button variant="danger" disabled={pending} />}
                      >
                        删除
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>删除参考文章？</AlertDialogTitle>
                          <AlertDialogDescription>
                            将删除「{reference.title}
                            」的原文、全部修订和拆解结果，此操作不可恢复。
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>取消</AlertDialogCancel>
                          <AlertDialogAction
                            variant="danger-solid"
                            disabled={pending}
                            onClick={() => {
                              setDeleteOpen(false);
                              void remove();
                            }}
                          >
                            确认删除
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>

                {selected.breakdown?.mode === "mock" && (
                  <Badge variant="mock" className="justify-self-start">
                    模拟
                  </Badge>
                )}
                {selected.breakdown && (
                  <FrameworkDialog
                    key={selected.breakdown.id}
                    open={frameworkOpen}
                    onOpenChange={setFrameworkOpen}
                    breakdownId={selected.breakdown.id}
                    frameworkName={selected.breakdown.result.hook.type}
                    slotCount={selected.breakdown.result.slots.length}
                    audience={selected.breakdown.result.audience}
                  />
                )}
                {selected.breakdown ? (
                  <BreakdownResult
                    content={reference.content}
                    result={selected.breakdown.result}
                  />
                ) : needsText ? (
                  <Empty>
                    <EmptyHeader>
                      <EmptyTitle>还没有正文</EmptyTitle>
                      <EmptyDescription>
                        打开原文复制正文，点击“粘贴正文”保存后再拆解。
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <div className="grid gap-4">
                    <AiConsentNotice />
                    <p className="text-sm text-ink-2">
                      {jobId
                        ? "正在拆解，通常需要半分钟到一分钟。可以离开本页，稍后回来查看。"
                        : "拆解会把原文发送给生成服务，提取标题类型、开头钩子、段落槽位、节奏、结尾方式、有效原因与局限；不会改写原文。"}
                    </p>
                    <p className="text-xs text-ink-2">
                      {modeNote(selected.aiMode)}
                    </p>
                    <Button
                      type="button"
                      className="justify-self-start"
                      disabled={
                        pending ||
                        jobId !== null ||
                        !selected.processingAvailable
                      }
                      onClick={() => void breakDown()}
                    >
                      {jobId ? "拆解中…" : "拆解这篇文章"}
                    </Button>
                    <div className="max-h-120 overflow-y-auto rounded-sm border bg-sunken p-4 font-serif text-reading whitespace-pre-wrap wrap-anywhere">
                      {reference.content}
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </section>
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (pending) return;
          setCreateOpen(open);
          if (!open) {
            setMode("view");
            setTitle("");
            setContent("");
            setUrl("");
            setError("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>拆解一篇爆款</DialogTitle>
            <DialogDescription>
              只提取结构与写法，原文仅你可见。
            </DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}{" "}
          <form className="grid gap-5" onSubmit={(event) => void create(event)}>
            <fieldset
              className="flex gap-1 rounded-sm bg-sunken p-1"
              aria-label="来源"
            >
              <Button
                type="button"
                variant={source === "text" ? "secondary" : "ghost"}
                aria-pressed={source === "text"}
                onClick={() => setSource("text")}
              >
                粘贴正文
              </Button>
              <Button
                type="button"
                variant={source === "link" ? "secondary" : "ghost"}
                aria-pressed={source === "link"}
                onClick={() => setSource("link")}
              >
                保存链接
              </Button>
            </fieldset>
            {source === "text" ? (
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="reference-title">
                    标题（可选）
                  </FieldLabel>
                  <Input
                    id="reference-title"
                    value={title}
                    maxLength={200}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                  <FieldDescription>留空时使用正文第一行。</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="reference-content">文章正文</FieldLabel>
                  <Textarea
                    id="reference-content"
                    value={content}
                    maxLength={MAX_CHARS}
                    rows={14}
                    required
                    onChange={(event) => setContent(event.target.value)}
                  />
                  <FieldDescription>
                    {content.length} / {MAX_CHARS} 字。保存不会调用模型。
                  </FieldDescription>
                </Field>
              </FieldGroup>
            ) : (
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="reference-url">公开链接</FieldLabel>
                  <Input
                    id="reference-url"
                    type="url"
                    value={url}
                    maxLength={2048}
                    required
                    placeholder="https://"
                    onChange={(event) => setUrl(event.target.value)}
                  />
                  <FieldDescription>
                    {remoteFetch
                      ? "只抓取公开网页，不登录、不绕过反爬；抓取失败时可以粘贴正文。"
                      : "当前未开启网页抓取：保存链接后请粘贴正文。"}
                  </FieldDescription>
                </Field>
                {remoteFetch && (
                  <Field orientation="horizontal">
                    <Switch
                      id="reference-fetch"
                      checked={fetchText}
                      onCheckedChange={setFetchText}
                    />
                    <FieldLabel htmlFor="reference-fetch">
                      尝试抓取正文
                    </FieldLabel>
                  </Field>
                )}
              </FieldGroup>
            )}
            <Button
              type="submit"
              className="justify-self-start"
              disabled={pending}
            >
              {pending ? "保存中…" : "保存参考文章"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </AppPage>
  );
}
