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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { StatusPill } from "@/components/ui/status-pill";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AiConsentNotice } from "@/modules/ai/client/ai-consent-notice";
import { type AiMode, modeNote } from "@/modules/ai/client/ai-mode";
import { RequestError, request } from "@/modules/articles/client/request";
import { useUnsavedChanges } from "@/modules/shell/client/unsaved-changes";

type Evidence = { sampleId: string; sampleTitle: string; quote: string };
type Memory = {
  id: string;
  content: string;
  status: "candidate" | "confirmed" | "disabled";
  origin: "manual" | "extracted";
  evidence: Evidence[];
  mode: string | null;
  jobId: string | null;
  version: number;
};
type Job = { id: string; status: string };
type Payload = {
  memories: Memory[];
  latestJob: Job | null;
  extraction: { available: boolean; mode: AiMode };
};
const LIMIT = 50;
const active = (job: Job | null) =>
  job !== null && ["queued", "running"].includes(job.status);
const message = (cause: unknown) =>
  cause instanceof Error ? cause.message : "操作失败，请重试。";

export function Memories() {
  const [data, setData] = useState<Payload | null>(null);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<{ id: string; content: string }>();
  const [jobId, setJobId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deleting, setDeleting] = useState<Memory | null>(null);
  useUnsavedChanges(Boolean(draft.trim() || editing));
  const load = useCallback(async (signal?: AbortSignal) => {
    const payload = await request<Payload>("/memories", { signal });
    setData(payload);
    if (active(payload.latestJob)) setJobId(payload.latestJob?.id ?? null);
    return payload;
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(message(cause));
    });
    return () => controller.abort();
  }, [load]);
  useEffect(() => {
    if (!jobId) return;
    let live = true;
    const timer = setInterval(() => {
      void request<{ job: Job }>(`/jobs/${jobId}`)
        .then(async ({ job }) => {
          if (!live || active(job)) return;
          setJobId(null);
          const payload = await load();
          if (job.status === "succeeded") {
            const found = payload.memories.filter(
              (memory) =>
                memory.jobId === job.id && memory.status === "candidate",
            ).length;
            setNotice(
              found
                ? `提取到 ${found} 条候选记忆，确认后才会用于生成。`
                : "没有提取到新的候选记忆。",
            );
          } else if (job.status === "stale")
            setError("历史文章已禁用、删除或修改，请重新提取。");
          else setError("提取失败，可以重新提取。");
        })
        .catch((cause: unknown) => {
          if (live) setError(message(cause));
        });
    }, 1500);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [jobId, load]);
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
          /* Keep the original error and current list until retry. */
        }
      }
    } finally {
      setPending(false);
    }
  }
  async function add() {
    await run(async () => {
      setData(
        await request<Payload>("/memories", {
          method: "POST",
          body: JSON.stringify({ content: draft }),
        }),
      );
      setDraft("");
      setNotice("记忆已添加并确认，后续生成会参考它。");
    });
  }
  async function change(
    memory: Memory,
    body: { content: string } | { status: "confirmed" | "disabled" },
    done: string,
  ) {
    await run(async () => {
      setData(
        await request<Payload>(`/memories/${memory.id}`, {
          method: "PATCH",
          body: JSON.stringify({ expectedVersion: memory.version, ...body }),
        }),
      );
      setEditing(undefined);
      setNotice(done);
    });
  }
  async function extract() {
    await run(async () => {
      const started = await request<{ jobId: string }>("/memories/extract", {
        method: "POST",
        headers: { "idempotency-key": crypto.randomUUID() },
      });
      setJobId(started.jobId);
      setNotice("正在从历史文章提取候选记忆…");
    });
  }
  async function remove(memory: Memory) {
    await run(async () => {
      await request(`/memories/${memory.id}`, { method: "DELETE" });
      setData((current) =>
        current
          ? {
              ...current,
              memories: current.memories.filter((row) => row.id !== memory.id),
            }
          : current,
      );
      setDeleting(null);
      setNotice(
        "记忆已删除，尚未执行的任务也不再读取它。已发送的请求和已有结果不受影响。",
      );
    });
  }
  const memories = data?.memories ?? [];
  const candidates = memories.filter((memory) => memory.status === "candidate");
  const decided = memories.filter((memory) => memory.status !== "candidate");
  const full = memories.length >= LIMIT;

  function body(memory: Memory) {
    if (editing?.id === memory.id)
      return (
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void change(
              memory,
              { content: editing.content },
              memory.status === "candidate"
                ? "候选已修改，确认后才会使用。"
                : "记忆已修改，尚未执行的任务不再读取旧文字。",
            );
          }}
        >
          <Field>
            <FieldLabel htmlFor={`memory-edit-${memory.id}`}>
              修改记忆
            </FieldLabel>
            <Textarea
              id={`memory-edit-${memory.id}`}
              value={editing.content}
              rows={2}
              maxLength={200}
              required
              disabled={pending}
              onChange={(event) =>
                setEditing({ id: memory.id, content: event.target.value })
              }
            />
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={pending || !editing.content.trim()}>
              保存修改
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => setEditing(undefined)}
            >
              取消
            </Button>
          </div>
        </form>
      );
    return <p className="break-words text-body text-ink">{memory.content}</p>;
  }
  function evidence(memory: Memory) {
    if (!memory.evidence.length) return null;
    return (
      <details>
        <summary className="cursor-pointer text-label text-accent">
          查看证据（{memory.evidence.length}）
        </summary>
        <ul className="mt-3 grid gap-3">
          {memory.evidence.map((item) => (
            <li
              key={`${item.sampleId}-${item.quote}`}
              className="grid gap-1 border-l-2 border-evidence pl-3"
            >
              <q className="break-words text-body text-ink-2">{item.quote}</q>
              <span className="text-meta text-ink-3">
                出自历史文章《{item.sampleTitle}》
              </span>
            </li>
          ))}
        </ul>
      </details>
    );
  }
  function actions(memory: Memory) {
    if (editing?.id === memory.id) return null;
    return (
      <div className="flex flex-wrap gap-3">
        {memory.status === "candidate" && (
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() =>
              void change(
                memory,
                { status: "confirmed" },
                "已确认，后续生成会参考这条记忆。",
              )
            }
          >
            确认使用
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => setEditing({ id: memory.id, content: memory.content })}
        >
          修改
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => setDeleting(memory)}
        >
          删除
        </Button>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>记忆</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6">
        <p className="text-body text-ink-2">
          记忆是你确认过的写作偏好，例如句式、语气和结构习惯。可以从启用的历史文章提取候选，逐条查看证据后确认；也可以自己写一条。只有已确认的记忆会用于选题、大纲、初稿和
          AI 修改，每次最多最近添加的 20
          条。本次写作要求与大纲优先；记忆不作事实依据。
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
        <section aria-label="提取候选记忆" className="grid gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              disabled={
                pending ||
                data === null ||
                jobId !== null ||
                !data.extraction.available ||
                full
              }
              onClick={() => void extract()}
            >
              从历史文章提取候选
            </Button>
            {jobId && <StatusPill tone="processing">正在提取</StatusPill>}
            {data?.extraction.mode === "mock" && (
              <Badge variant="mock">模拟</Badge>
            )}
          </div>
          <p className="text-meta text-ink-2">
            {data === null
              ? "加载中…"
              : data.extraction.available
                ? `使用最近添加的 3 篇启用历史文章，每篇开头 2000 字。${modeNote(data.extraction.mode)}`
                : "当前未配置可用的生成服务，暂时不能提取；仍可手动添加记忆。"}
          </p>
          <AiConsentNotice />
        </section>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <Field>
            <FieldLabel htmlFor="memory-content">写一条记忆</FieldLabel>
            <Textarea
              id="memory-content"
              value={draft}
              rows={2}
              maxLength={200}
              required
              disabled={pending}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="例如：段落多用两三句短句，结尾不喊口号"
            />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              disabled={pending || data === null || !draft.trim() || full}
            >
              添加并确认
            </Button>
            <span className="text-meta text-ink-2">
              {data === null ? "加载中…" : `${memories.length} / ${LIMIT} 条`}
            </span>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => void run(async () => void (await load()))}
            >
              刷新列表
            </Button>
          </div>
        </form>
        {candidates.length > 0 && (
          <section aria-label="待确认的候选" className="grid gap-4">
            <h3 className="text-title-card text-ink">
              待确认（{candidates.length}）
            </h3>
            <p className="text-meta text-ink-2">
              候选不会用于生成。核对证据后确认、修改或删除。
            </p>
            {candidates.map((memory) => (
              <article
                key={memory.id}
                aria-label={`候选：${memory.content}`}
                className="grid gap-3 border-t border-line pt-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill tone="pending">候选</StatusPill>
                  {memory.mode === "mock" && <Badge variant="mock">模拟</Badge>}
                </div>
                {body(memory)}
                {evidence(memory)}
                {actions(memory)}
              </article>
            ))}
          </section>
        )}
        <section aria-label="我的记忆" className="grid gap-4">
          <h3 className="text-title-card text-ink">我的记忆</h3>
          {data !== null && decided.length === 0 && (
            <p className="text-body text-ink-2">
              还没有确认的记忆。确认候选或手动添加后，生成会参考它们。
            </p>
          )}
          {decided.map((memory) => {
            const used = memory.status === "confirmed";
            return (
              <article
                key={memory.id}
                aria-label={memory.content}
                className="grid gap-3 border-t border-line pt-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <span className="text-meta text-ink-2">
                    {memory.origin === "manual" ? "手动添加" : "从历史文章提取"}
                    {" · "}版本 {memory.version}
                  </span>
                  <div className="flex items-center gap-3">
                    <Switch
                      aria-label={`使用记忆：${memory.content}`}
                      checked={used}
                      disabled={pending || editing?.id === memory.id}
                      onCheckedChange={(checked) =>
                        void change(
                          memory,
                          { status: checked ? "confirmed" : "disabled" },
                          checked
                            ? "已启用，后续生成会参考这条记忆。"
                            : "已禁用，尚未执行的任务也不再读取它。已发送的请求和已有结果不受影响。",
                        )
                      }
                    />
                    <span className="text-label text-ink-2">
                      {used ? "使用中" : "已禁用"}
                    </span>
                  </div>
                </div>
                {body(memory)}
                {evidence(memory)}
                {actions(memory)}
              </article>
            );
          })}
        </section>
        <AlertDialog
          open={deleting !== null}
          onOpenChange={(open) => {
            if (!open && !pending) setDeleting(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogTitle>删除这条记忆？</AlertDialogTitle>
            <AlertDialogDescription>
              删除「{deleting?.content}
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
