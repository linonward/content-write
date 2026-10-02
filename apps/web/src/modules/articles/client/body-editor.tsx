"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AiMode } from "@/modules/ai/client/ai-mode";
import { useUnsavedChanges } from "@/modules/shell/client/unsaved-changes";
import { AiEditPanel } from "./ai-edit-panel";
import {
  type LocalCopy,
  readLocalCopy,
  recoveryState,
  removeLocalCopy,
  writeLocalCopy,
} from "./local-copy";
import { MarkdownEditor, type TextRange } from "./markdown-editor";
import { RequestError, request } from "./request";

type Text = { title: string; body: string };
type Snapshot = Text & { version: number };
type Status =
  | { kind: "idle" | "saving" | "saved" | "conflict" }
  | { kind: "failed"; message: string };
type Recovery = { copy: LocalCopy; outdated: boolean };

const MAX_BODY = 50_000;
const SAVE_DELAY_MS = 1000;

function changed(text: Text, saved: Text) {
  // The API trims titles, so surrounding spaces alone are not an edit.
  return text.title.trim() !== saved.title || text.body !== saved.body;
}

/**
 * Title and Markdown body with autosave. Each save carries the version it was
 * based on; a conflict pauses saving instead of overwriting newer text, and
 * unsaved text stays in this browser until the server has it.
 */
export function BodyEditor({
  articleId,
  server,
  generationAvailable,
  aiMode,
  onSaved,
  onReload,
}: {
  articleId: string;
  server: Snapshot;
  generationAvailable: boolean;
  aiMode: AiMode;
  /** Updates the page's copy of the article without reloading other unsaved forms. */
  onSaved: (saved: Snapshot) => void;
  onReload: () => Promise<void>;
}) {
  const [title, setTitle] = useState(server.title);
  const [body, setBody] = useState(server.body);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [recovery, setRecovery] = useState<Recovery | null>(null);
  const [selection, setSelection] = useState<TextRange>({ start: 0, end: 0 });
  const saved = useRef<Snapshot>(server);
  const latest = useRef<Text>({ title, body });
  latest.current = { title, body };
  const statusRef = useRef(status);
  statusRef.current = status;
  const inflight = useRef(false);
  const again = useRef(false);
  const forceSync = useRef(false);

  const checkRecovery = useCallback(
    (current: Snapshot) => {
      const copy = readLocalCopy(window.localStorage, articleId);
      const state = recoveryState(copy, current);
      if (state === "same") removeLocalCopy(window.localStorage, articleId);
      setRecovery(
        copy && (state === "restorable" || state === "outdated")
          ? { copy, outdated: state === "outdated" }
          : null,
      );
    },
    [articleId],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: only the first server snapshot is compared on mount.
  useEffect(() => checkRecovery(server), [checkRecovery]);

  // Follow server changes that did not come from this editor.
  useEffect(() => {
    const dirty = changed(latest.current, saved.current);
    const sameText =
      server.title === saved.current.title &&
      server.body === saved.current.body;
    if (forceSync.current || !dirty) {
      saved.current = server;
      setTitle(server.title);
      setBody(server.body);
      if (forceSync.current) {
        forceSync.current = false;
        setStatus({ kind: "idle" });
        checkRecovery(server);
      }
    } else if (sameText) {
      // Brief or outline edits bump the version without touching the body: safe to rebase.
      saved.current = server;
    }
  }, [server, checkRecovery]);

  const save = useCallback(async () => {
    if (inflight.current) {
      again.current = true;
      return;
    }
    const text = latest.current;
    const base = saved.current;
    if (!changed(text, base)) return;
    writeLocalCopy(window.localStorage, articleId, {
      baseVersion: base.version,
      ...text,
      savedAt: new Date().toISOString(),
    });
    if (!text.title.trim()) {
      setStatus({ kind: "failed", message: "标题不能为空。" });
      return;
    }
    if (text.body.length > MAX_BODY) {
      setStatus({ kind: "failed", message: "正文超过 50,000 字符。" });
      return;
    }
    inflight.current = true;
    setStatus({ kind: "saving" });
    try {
      const { version } = await request<{ version: number }>(
        `/articles/${articleId}/body`,
        {
          method: "PUT",
          body: JSON.stringify({ expectedVersion: base.version, ...text }),
        },
      );
      saved.current = { version, title: text.title.trim(), body: text.body };
      if (!changed(latest.current, saved.current))
        removeLocalCopy(window.localStorage, articleId);
      setStatus({ kind: "saved" });
      onSaved(saved.current);
    } catch (cause) {
      setStatus(
        cause instanceof RequestError && cause.status === 409
          ? { kind: "conflict" }
          : {
              kind: "failed",
              message: cause instanceof Error ? cause.message : "保存失败。",
            },
      );
    } finally {
      inflight.current = false;
      if (again.current) {
        again.current = false;
        void save();
      }
    }
  }, [articleId, onSaved]);

  // Autosave one second after typing stops; a conflict waits for the author.
  useEffect(() => {
    if (statusRef.current.kind === "conflict") return;
    if (!changed({ title, body }, saved.current)) return;
    const timer = setTimeout(() => void save(), SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [title, body, save]);

  // Keep unsaved text and warn before leaving.
  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (!changed(latest.current, saved.current)) return;
      writeLocalCopy(window.localStorage, articleId, {
        baseVersion: saved.current.version,
        ...latest.current,
        savedAt: new Date().toISOString(),
      });
      event.preventDefault();
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [articleId]);

  async function loadLatest() {
    forceSync.current = true;
    try {
      await onReload();
    } catch {
      forceSync.current = false;
      setStatus({ kind: "failed", message: "载入最新版本失败，请重试。" });
    }
  }
  function restore(copy: LocalCopy) {
    setRecovery(null);
    setTitle(copy.title);
    setBody(copy.body);
  }
  function dismiss() {
    removeLocalCopy(window.localStorage, articleId);
    setRecovery(null);
  }

  const dirty = changed({ title, body }, saved.current);
  useUnsavedChanges(dirty);
  const label =
    status.kind === "saving"
      ? "保存中…"
      : status.kind === "failed"
        ? `保存失败：${status.message}内容已保存在本机。`
        : status.kind === "conflict"
          ? "已暂停自动保存"
          : dirty
            ? "有未保存的修改"
            : status.kind === "saved"
              ? "已保存"
              : "";
  return (
    <div className="space-y-4">
      {recovery && (
        <Alert>
          <AlertDescription className="space-y-3">
            <p>
              {recovery.outdated
                ? `本机有一份未保存的内容，基于版本 ${recovery.copy.baseVersion}；服务器上已是版本 ${server.version}。继续使用会用它替换当前正文。`
                : "本机有一份未保存的内容。"}
              （{new Date(recovery.copy.savedAt).toLocaleString("zh-CN")}）
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => restore(recovery.copy)}
              >
                {recovery.outdated ? "使用本机内容继续编辑" : "恢复本机内容"}
              </Button>
              <Button type="button" variant="ghost" onClick={dismiss}>
                丢弃本机内容
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
      {status.kind === "conflict" && (
        <Alert variant="destructive">
          <AlertDescription className="space-y-3">
            <p>
              文章已有更新的版本，你的修改没有覆盖它，已保存在本机。载入最新版本后，可以在提示中找回本机内容。
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void loadLatest()}
            >
              载入最新版本
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor="article-title">标题</Label>
        <Input
          id="article-title"
          value={title}
          maxLength={200}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      <div className="flex flex-col items-start gap-4 lg:flex-row">
        <div className="w-full min-w-0 flex-1 space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="article-body">正文（Markdown）</Label>
            <span
              className="text-xs text-ink-2"
              role="status"
              aria-live="polite"
            >
              {label}
              {status.kind === "failed" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void save()}
                >
                  重试
                </Button>
              )}
            </span>
          </div>
          <MarkdownEditor
            id="article-body"
            label="正文（Markdown）"
            value={body}
            onChange={setBody}
            onSelectionChange={setSelection}
          />
          <p className="text-xs text-ink-2">
            {body.length.toLocaleString("zh-CN")} / 50,000 字符
          </p>
        </div>
        <AiEditPanel
          articleId={articleId}
          body={body}
          version={saved.current.version}
          selection={selection}
          blocked={
            status.kind === "conflict"
              ? "文章已有更新的版本，载入最新版本后再请求修改。"
              : dirty || status.kind === "saving" || status.kind === "failed"
                ? "正文有未保存的修改，保存完成后才能请求或应用修改。"
                : null
          }
          available={generationAvailable}
          aiMode={aiMode}
          onApplied={onReload}
        />
      </div>
    </div>
  );
}
