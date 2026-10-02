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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { request } from "./request";

type Revision = {
  version: number;
  source: "edit" | "draft" | "restore" | "ai_edit";
  title: string;
  restoredFrom: number | null;
  chars: number;
  createdAt: string;
};

function describe(revision: Revision) {
  if (revision.source === "draft") return "初稿";
  if (revision.source === "ai_edit") return "AI 修改";
  if (revision.source === "restore")
    return `恢复自版本 ${revision.restoredFrom}`;
  return "编辑";
}

/** Body history, newest first. Restoring appends a version; nothing is deleted. */
export function RevisionHistory({
  articleId,
  currentVersion,
  onRestored,
}: {
  articleId: string;
  currentVersion: number;
  onRestored: () => Promise<void>;
}) {
  const [revisions, setRevisions] = useState<Revision[] | null>(null);
  const [open, setOpen] = useState<{ version: number; body: string } | null>(
    null,
  );
  const [confirming, setConfirming] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const result = await request<{ revisions: Revision[] }>(
      `/articles/${articleId}/revisions`,
    );
    setRevisions(result.revisions);
  }, [articleId]);
  // Reload whenever the article moves to a new version, including autosaves.
  // biome-ignore lint/correctness/useExhaustiveDependencies: currentVersion is the reload trigger.
  useEffect(() => {
    void load().catch((cause: unknown) =>
      setError(cause instanceof Error ? cause.message : "历史版本加载失败。"),
    );
  }, [load, currentVersion]);

  async function view(version: number) {
    if (open?.version === version) {
      setOpen(null);
      return;
    }
    setError("");
    try {
      const { revision } = await request<{
        revision: { version: number; body: string };
      }>(`/articles/${articleId}/revisions/${version}`);
      setOpen({ version, body: revision.body });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "历史版本加载失败。");
    }
  }
  async function restore(version: number) {
    if (pending) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      await request(`/articles/${articleId}/restore`, {
        method: "POST",
        body: JSON.stringify({
          expectedVersion: currentVersion,
          revision: version,
        }),
      });
      await onRestored();
      setOpen(null);
      setNotice(`已恢复版本 ${version} 的内容，生成了新版本。`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "恢复失败。");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>历史版本</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {notice && (
          <Alert role="status">
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}
        <p className="text-sm text-ink-2">
          恢复会把所选版本的标题和正文作为新版本保存，原有历史都会保留。
        </p>
        {revisions === null ? (
          <p className="text-sm text-ink-2">加载中…</p>
        ) : revisions.length === 0 ? (
          <p className="text-sm text-ink-2">
            正文保存或生成初稿后，这里会出现历史版本。
          </p>
        ) : (
          <ul className="space-y-2">
            {revisions.map((revision) => {
              const current = revision.version === currentVersion;
              return (
                <li key={revision.version} className="rounded-sm border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0 text-sm">
                      <strong>版本 {revision.version}</strong>
                      <span className="ml-2 text-ink-2">
                        {describe(revision)} ·{" "}
                        {new Date(revision.createdAt).toLocaleString("zh-CN")} ·{" "}
                        {revision.chars.toLocaleString("zh-CN")} 字
                        {current && " · 当前"}
                      </span>
                      <p className="truncate text-ink-2">{revision.title}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => void view(revision.version)}
                      >
                        {open?.version === revision.version ? "收起" : "查看"}
                      </Button>
                      <AlertDialog
                        open={confirming === revision.version}
                        onOpenChange={(next) =>
                          setConfirming(next ? revision.version : null)
                        }
                      >
                        <AlertDialogTrigger
                          render={
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={pending || current}
                            />
                          }
                        >
                          恢复此版本
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              恢复版本 {revision.version}？
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              当前正文会被替换为版本 {revision.version}
                              的内容，并保存为新版本。当前内容仍保留在历史中，可以再恢复回来。
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction
                              disabled={pending}
                              onClick={() => {
                                setConfirming(null);
                                void restore(revision.version);
                              }}
                            >
                              确认恢复
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                  {open?.version === revision.version && (
                    <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-sm bg-sunken p-3 font-sans text-sm leading-7">
                      {open.body}
                    </pre>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
