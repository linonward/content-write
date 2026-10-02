"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { type AiMode, modeLabel, modeNote } from "@/modules/ai/client/ai-mode";
import { editDiff } from "./edit-diff";
import type { TextRange } from "./markdown-editor";
import { request } from "./request";

type Scope = "selection" | "full";
type Suggestion = {
  id: string;
  scope: Scope;
  baseVersion: number;
  start: number;
  end: number;
  selectionText: string;
  instruction: string;
  replacement: string;
  explanation: string;
  evidenceGaps: string[];
  mode: string;
  stale: boolean;
};
type Job = { id: string; status: string; errorCode: string | null };

const MAX_SELECTION = 8_000;
const PRESETS = ["更精简", "更口语", "更有条理", "补上过渡"];

function Diff({ before, after }: { before: string; after: string }) {
  const parts = editDiff(before, after);
  if (!parts)
    return (
      <div className="space-y-2 text-sm">
        <p className="text-xs text-muted-foreground">
          改动较大，分别显示原文与建议。
        </p>
        <pre className="whitespace-pre-wrap break-words rounded-md bg-muted p-3 font-sans leading-7 line-through decoration-destructive/60">
          {before}
        </pre>
        <pre className="whitespace-pre-wrap break-words rounded-md bg-muted p-3 font-sans leading-7">
          {after}
        </pre>
      </div>
    );
  return (
    <pre className="whitespace-pre-wrap break-words rounded-md bg-muted p-3 font-sans text-sm leading-7">
      {parts.map((part) =>
        part.kind === "same" ? (
          <span key={part.key}>{part.text}</span>
        ) : part.kind === "removed" ? (
          <del
            key={part.key}
            className="bg-destructive/15 text-destructive decoration-destructive/70"
          >
            {part.text}
          </del>
        ) : (
          <ins
            key={part.key}
            className="bg-primary/15 text-primary no-underline"
          >
            {part.text}
          </ins>
        ),
      )}
    </pre>
  );
}

/**
 * Asks for an AI rewrite of the selection (or, when chosen, the whole body).
 * Results stay candidates with a diff until the author applies or rejects
 * them; the body itself only changes through apply, as a new version.
 */
export function AiEditPanel({
  articleId,
  body,
  version,
  selection,
  blocked,
  available,
  aiMode,
  onApplied,
}: {
  articleId: string;
  /** The editor's current text; offsets in `selection` refer to it. */
  body: string;
  /** Saved version the editor text belongs to. */
  version: number;
  selection: TextRange;
  /** Set while the editor has unsaved or conflicting text. */
  blocked: string | null;
  available: boolean;
  aiMode: AiMode;
  onApplied: () => Promise<void>;
}) {
  const [scope, setScope] = useState<Scope>("selection");
  const [instruction, setInstruction] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const result = await request<{
      suggestions: Suggestion[];
      latestJob: Job | null;
    }>(`/articles/${articleId}/suggestions`);
    setSuggestions(result.suggestions);
    setJobId(
      (current) =>
        current ??
        (result.latestJob &&
        ["queued", "running"].includes(result.latestJob.status)
          ? result.latestJob.id
          : null),
    );
  }, [articleId]);
  // Reload on every saved version: stale flags depend on it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: version is the trigger, not an input.
  useEffect(() => {
    load().catch((cause: unknown) =>
      setError(cause instanceof Error ? cause.message : "修改建议载入失败。"),
    );
  }, [load, version]);

  useEffect(() => {
    if (!jobId) return;
    let live = true;
    const timer = setInterval(() => {
      void request<{ job: Job }>(`/jobs/${jobId}`)
        .then(async ({ job }) => {
          if (!live) return;
          if (job.status === "succeeded") {
            setNotice("修改建议已生成，确认差异后再决定是否应用。");
            setJobId(null);
            await load();
          } else if (["failed", "stale"].includes(job.status)) {
            setJobId(null);
            setError(
              job.status === "stale"
                ? "生成期间正文已变化，这次结果未保存，请重新选择后再试。"
                : "修改建议生成失败，请重试。",
            );
          }
        })
        .catch((cause: unknown) => {
          if (live)
            setError(
              cause instanceof Error ? cause.message : "任务状态获取失败。",
            );
        });
    }, 2000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [jobId, load]);

  const range = scope === "full" ? { start: 0, end: body.length } : selection;
  const selected = body.slice(range.start, range.end);
  const unavailable = !available
    ? "当前未配置可用的生成服务。"
    : !body.trim()
      ? "生成或写好正文后，可以请求 AI 修改。"
      : blocked;
  const selectionProblem =
    scope === "selection" && range.end <= range.start
      ? "在正文中选中要修改的文字。"
      : !selected.trim()
        ? "选中的内容只有空白。"
        : selected.length > MAX_SELECTION
          ? `${scope === "full" ? "全文" : "选区"}超过 8,000 字符，请分段选择修改。`
          : null;

  /** Runs one action; its returned text becomes the notice. */
  async function act(run: () => Promise<string>) {
    if (pending) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      setNotice(await run());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失败。");
    } finally {
      setPending(false);
    }
  }
  const generate = () =>
    act(async () => {
      const result = await request<{ jobId: string }>(
        `/articles/${articleId}/edit`,
        {
          method: "POST",
          headers: { "idempotency-key": crypto.randomUUID() },
          body: JSON.stringify({
            expectedVersion: version,
            scope,
            start: range.start,
            end: range.end,
            selectionText: selected,
            instruction: instruction.trim(),
          }),
        },
      );
      setJobId(result.jobId);
      return "修改任务已创建。等待期间请不要修改正文，否则建议会过期。";
    });
  const apply = (suggestion: Suggestion) =>
    act(async () => {
      const result = await request<{ version: number }>(
        `/articles/${articleId}/suggestions/${suggestion.id}/apply`,
        { method: "POST", body: JSON.stringify({ expectedVersion: version }) },
      );
      await onApplied();
      await load();
      return `已应用修改，正文保存为版本 ${result.version}。`;
    });
  const reject = (suggestion: Suggestion) =>
    act(async () => {
      await request(
        `/articles/${articleId}/suggestions/${suggestion.id}/reject`,
        { method: "POST" },
      );
      await load();
      return "已拒绝这条建议，正文未改动。";
    });

  return (
    <aside className="space-y-4 rounded-lg border p-4" aria-label="AI 修改">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium">AI 修改</h3>
        <Badge variant="outline">{modeLabel(aiMode)}</Badge>
      </div>
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
      <p className="text-xs text-muted-foreground">
        {unavailable ??
          `${modeNote(aiMode)}建议先作为候选显示，应用前不会改动正文。`}
      </p>
      <fieldset className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
        <legend className="sr-only">修改范围</legend>
        {(["selection", "full"] as const).map((value) => (
          <label
            key={value}
            className={cn(
              "cursor-pointer rounded px-2 py-1 text-center text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/50",
              scope === value
                ? "bg-background shadow-sm"
                : "text-muted-foreground",
            )}
          >
            <input
              type="radio"
              name="edit-scope"
              value={value}
              checked={scope === value}
              onChange={() => setScope(value)}
              className="sr-only"
            />
            {value === "selection" ? "选区" : "全文"}
          </label>
        ))}
      </fieldset>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {selectionProblem ??
          `${scope === "full" ? "全文" : "已选"} ${selected.length.toLocaleString("zh-CN")} 字：「${selected.trim().slice(0, 40)}${selected.trim().length > 40 ? "…" : ""}」`}
      </p>
      <div className="space-y-2">
        <Label htmlFor="edit-instruction">修改要求</Label>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <Button
              key={preset}
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setInstruction(preset)}
            >
              {preset}
            </Button>
          ))}
        </div>
        <Textarea
          id="edit-instruction"
          value={instruction}
          maxLength={500}
          rows={3}
          placeholder="例如：删掉重复的表达，保留例子。"
          onChange={(event) => setInstruction(event.target.value)}
        />
      </div>
      <Button
        type="button"
        className="w-full"
        disabled={
          pending ||
          Boolean(jobId) ||
          Boolean(unavailable) ||
          Boolean(selectionProblem) ||
          !instruction.trim()
        }
        onClick={() => void generate()}
      >
        {jobId ? "生成中…" : "生成修改建议"}
      </Button>
      {suggestions.map((suggestion) => (
        <div key={suggestion.id} className="space-y-3 rounded-lg border p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">
              {suggestion.scope === "full" ? "全文修改" : "选区修改"}
            </span>
            <span className="text-muted-foreground">
              {suggestion.instruction}
            </span>
            <Badge variant="outline">{modeLabel(suggestion.mode)}</Badge>
          </div>
          {suggestion.stale && (
            <Alert variant="destructive">
              <AlertDescription>
                正文已变化，这条建议已过期，不能应用。拒绝后可以重新选择生成。
              </AlertDescription>
            </Alert>
          )}
          <Diff
            before={suggestion.selectionText}
            after={suggestion.replacement}
          />
          <p className="text-sm">{suggestion.explanation}</p>
          {suggestion.evidenceGaps.length > 0 && (
            <div className="text-sm">
              <h4 className="font-medium">待补证据</h4>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                {suggestion.evidenceGaps.map((gap) => (
                  <li key={gap}>{gap}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={pending || suggestion.stale || Boolean(blocked)}
              onClick={() => void apply(suggestion)}
            >
              应用
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => void reject(suggestion)}
            >
              拒绝
            </Button>
          </div>
        </div>
      ))}
    </aside>
  );
}
