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
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { RequestError, request } from "@/modules/articles/client/request";
import { useUnsavedChanges } from "@/modules/shell/client/unsaved-changes";

type Sample = {
  id: string;
  title: string;
  content: string;
  enabled: boolean;
  version: number;
  createdAt: string;
};
const message = (cause: unknown) =>
  cause instanceof Error ? cause.message : "操作失败，请重试。";
export function WritingSamples() {
  const [samples, setSamples] = useState<Sample[] | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deleting, setDeleting] = useState<Sample | null>(null);
  useUnsavedChanges(Boolean(title || content));
  const load = useCallback(async (signal?: AbortSignal) => {
    const data = await request<{ samples: Sample[] }>("/writing-samples", {
      signal,
    });
    setSamples(data.samples);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(message(cause));
    });
    return () => controller.abort();
  }, [load]);
  async function run(action: () => Promise<void>) {
    setPending(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (cause) {
      setError(message(cause));
      if (
        cause instanceof RequestError &&
        (cause.status === 409 || cause.status === 404)
      ) {
        try {
          await load();
        } catch {
          /* Retain the original error and current list until retry. */
        }
      }
    } finally {
      setPending(false);
    }
  }
  async function add() {
    await run(async () => {
      const { sample } = await request<{ sample: Sample }>("/writing-samples", {
        method: "POST",
        body: JSON.stringify({ title, content }),
      });
      setSamples((current) => [sample, ...(current ?? [])]);
      setTitle("");
      setContent("");
      setNotice("历史文章已添加并启用，后续生成可参考它的写法。");
    });
  }
  async function toggle(sample: Sample, enabled: boolean) {
    await run(async () => {
      const data = await request<{ sample: Sample }>(
        `/writing-samples/${sample.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ expectedVersion: sample.version, enabled }),
        },
      );
      setSamples(
        (current) =>
          current?.map((row) => (row.id === sample.id ? data.sample : row)) ??
          null,
      );
      setNotice(
        enabled
          ? "已启用，将用于后续生成的风格参考。"
          : "已禁用，尚未执行的任务也不再读取这篇文章。已发送的请求和已有结果不受影响。",
      );
    });
  }
  async function remove(sample: Sample) {
    await run(async () => {
      await request(`/writing-samples/${sample.id}`, { method: "DELETE" });
      setSamples(
        (current) => current?.filter((row) => row.id !== sample.id) ?? null,
      );
      setDeleting(null);
      setNotice(
        "历史文章已删除，尚未执行的任务也不再读取它。已发送的请求和已有结果不受影响。",
      );
    });
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>历史文章</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6">
        <p className="text-body text-ink-2">
          添加你本人写过的文章，帮助把握句式、节奏和语气。历史文章只作风格参考，不作事实依据；本次写作要求与作者设置优先。每次最多使用最近添加的
          3 篇启用文章，每篇取开头 2000
          字。真实生成时，这些节选会发送给已配置的模型服务。
        </p>
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
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <Field>
            <FieldLabel htmlFor="sample-title">历史文章标题</FieldLabel>
            <Input
              id="sample-title"
              value={title}
              maxLength={200}
              required
              disabled={pending}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="一篇能代表你写法的文章"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="sample-content">历史文章正文</FieldLabel>
            <Textarea
              id="sample-content"
              value={content}
              rows={6}
              maxLength={20000}
              required
              disabled={pending}
              onChange={(event) => setContent(event.target.value)}
              placeholder="粘贴你本人写过的正文，最多 20000 字"
            />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              disabled={
                pending ||
                samples === null ||
                !title.trim() ||
                !content.trim() ||
                samples.length >= 20
              }
            >
              添加历史文章
            </Button>
            <span className="text-meta text-ink-2">
              {samples === null ? "加载中…" : `${samples.length} / 20 篇`}
            </span>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => void run(() => load())}
            >
              刷新列表
            </Button>
          </div>
        </form>
        {samples?.length === 0 && (
          <p className="text-body text-ink-2">
            还没有历史文章。建议先添加一篇最能代表你当前写法的文章。
          </p>
        )}
        <div className="grid gap-4">
          {samples?.map((sample) => (
            <article
              key={sample.id}
              aria-label={sample.title}
              className="grid gap-3 border-t border-line pt-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <h3 className="min-w-0 break-words text-title-card text-ink">
                  {sample.title}
                </h3>
                <div className="flex items-center gap-3">
                  <Switch
                    aria-label={`启用 ${sample.title}`}
                    checked={sample.enabled}
                    disabled={pending}
                    onCheckedChange={(enabled) => void toggle(sample, enabled)}
                  />
                  <span className="text-label text-ink-2">
                    {sample.enabled ? "已启用" : "已禁用"}
                  </span>
                </div>
              </div>
              <div className="text-meta text-ink-2">
                {sample.content.length} 字 · 版本 {sample.version}
              </div>
              <details>
                <summary className="cursor-pointer text-label text-accent">
                  查看正文
                </summary>
                <p className="mt-3 whitespace-pre-wrap break-words text-body text-ink-2">
                  {sample.content}
                </p>
              </details>
              <div>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => setDeleting(sample)}
                >
                  删除历史文章
                </Button>
              </div>
            </article>
          ))}
        </div>
        <AlertDialog
          open={deleting !== null}
          onOpenChange={(open) => {
            if (!open && !pending) setDeleting(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogTitle>删除历史文章？</AlertDialogTitle>
            <AlertDialogDescription>
              删除「{deleting?.title}
              」后无法恢复。尚未执行的任务不再读取它，已有生成结果保留。
            </AlertDialogDescription>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>取消</AlertDialogCancel>
              <AlertDialogAction
                variant="danger-solid"
                disabled={pending}
                onClick={() => {
                  if (deleting) void remove(deleting);
                }}
              >
                确认删除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
