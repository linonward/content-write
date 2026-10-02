"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type AiMode, modeLabel, modeNote } from "@/modules/ai/client/ai-mode";
import { BodyEditor } from "./body-editor";
import { request } from "./request";

type SourceLink = {
  claim: string;
  materialId: string;
  materialVersion: number;
  evidenceIds: string[];
};
export type Candidate = {
  id: string;
  title: string;
  markdown: string;
  sourceMap: SourceLink[];
  evidenceGaps: string[];
  createdAt: string;
};
export type DraftState = {
  version: number;
  workingTitle: string;
  title: string | null;
  body: string | null;
  outlineConfirmedAt: string | null;
  currentDraft: {
    id: string;
    sourceMap: SourceLink[];
    evidenceGaps: string[];
    mode: string;
  } | null;
  candidates: Candidate[];
};
type Job = { id: string; status: string; errorCode: string | null };

function Provenance({
  sourceMap,
  evidenceGaps,
  titles,
}: {
  sourceMap: SourceLink[];
  evidenceGaps: string[];
  titles: Map<string, string>;
}) {
  return (
    <div className="space-y-3 text-sm">
      <div>
        <h4 className="font-medium">来源映射</h4>
        {sourceMap.length ? (
          <ul className="mt-1 space-y-1 text-ink-2">
            {sourceMap.map((link) => (
              <li
                key={`${link.materialId}:${link.evidenceIds.join(",")}:${link.claim}`}
              >
                「{link.claim}」← {titles.get(link.materialId) ?? "来源素材"}
                （版本 {link.materialVersion}，片段{" "}
                {link.evidenceIds.join("、")}）
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-ink-2">本稿没有关联来源片段。</p>
        )}
      </div>
      <div>
        <h4 className="font-medium">待补证据</h4>
        {evidenceGaps.length ? (
          <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-2">
            {evidenceGaps.map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-ink-2">没有标出待补证据。</p>
        )}
      </div>
    </div>
  );
}

export function DraftPanel({
  articleId,
  draft,
  latestJob,
  generationAvailable,
  aiMode,
  blockedReason,
  sourceTitles,
  onChanged,
  onBodySaved,
}: {
  articleId: string;
  draft: DraftState;
  latestJob: Job | null;
  generationAvailable: boolean;
  aiMode: AiMode;
  /** Set when the outline or sources make generation impossible right now. */
  blockedReason: string | null;
  sourceTitles: Map<string, string>;
  onChanged: () => Promise<void>;
  onBodySaved: (saved: {
    version: number;
    title: string;
    body: string;
  }) => void;
}) {
  // Before any body exists the editor starts from the working title and an empty page.
  const server = useMemo(
    () => ({
      version: draft.version,
      title: draft.title ?? draft.workingTitle,
      body: draft.body ?? "",
    }),
    [draft.version, draft.title, draft.workingTitle, draft.body],
  );
  const [jobId, setJobId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setJobId(
      latestJob && ["queued", "running"].includes(latestJob.status)
        ? latestJob.id
        : null,
    );
  }, [latestJob]);
  useEffect(() => {
    if (!jobId) return;
    let live = true;
    const timer = setInterval(() => {
      void request<{ job: Job }>(`/jobs/${jobId}`)
        .then(async ({ job }) => {
          if (!live) return;
          if (job.status === "succeeded") {
            // Clearing jobId ends this effect, so set the notice before that.
            setNotice(
              draft.body === null
                ? "初稿已生成。"
                : "新初稿已保存为候选，正文未改动。",
            );
            setJobId(null);
            await onChanged();
          } else if (["failed", "stale"].includes(job.status)) {
            setJobId(null);
            setError(
              job.status === "stale"
                ? "生成期间大纲或来源已变化，这次结果未保存，请重新生成。"
                : "初稿生成失败，请重试。",
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
  }, [jobId, onChanged, draft.body]);

  async function act(run: () => Promise<void>, done: string) {
    if (pending) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      await run();
      setNotice(done);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失败。");
    } finally {
      setPending(false);
    }
  }
  const generate = () =>
    act(async () => {
      const result = await request<{ jobId: string }>(
        `/articles/${articleId}/draft/generate`,
        {
          method: "POST",
          headers: { "idempotency-key": crypto.randomUUID() },
          body: JSON.stringify({ expectedVersion: draft.version }),
        },
      );
      setJobId(result.jobId);
    }, "初稿任务已创建，刷新页面后仍可查看进度。");
  const apply = (candidate: Candidate) =>
    act(async () => {
      await request(`/articles/${articleId}/drafts/${candidate.id}/apply`, {
        method: "POST",
        body: JSON.stringify({ expectedVersion: draft.version }),
      });
      await onChanged();
    }, "已用候选替换正文。");
  const discard = (candidate: Candidate) =>
    act(async () => {
      await request(`/articles/${articleId}/drafts/${candidate.id}/discard`, {
        method: "POST",
      });
      await onChanged();
    }, "候选已丢弃。");

  const unavailable = !generationAvailable
    ? "当前未配置可用的生成服务。"
    : !draft.outlineConfirmedAt
      ? "确认大纲后才能生成初稿。"
      : blockedReason;
  return (
    <Card>
      <CardHeader>
        <CardTitle>正文与初稿</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
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
          {unavailable ??
            `${modeNote(aiMode)}初稿只按已确认的大纲和来源成文，来源映射只是辅助溯源，不代表全文已核实。`}
        </p>
        {draft.body !== null && !unavailable && (
          <p className="text-sm text-ink-2">
            已有正文：再次生成的结果会保存为候选，不会覆盖正文。
          </p>
        )}
        <Button
          type="button"
          disabled={pending || Boolean(jobId) || Boolean(unavailable)}
          onClick={() => void generate()}
        >
          {jobId
            ? "生成中…"
            : draft.body === null
              ? "根据大纲生成初稿"
              : "再生成一版候选"}
        </Button>
        <BodyEditor
          articleId={articleId}
          server={server}
          onSaved={onBodySaved}
          onReload={onChanged}
        />
        {draft.currentDraft && (
          <div className="space-y-2 rounded-sm border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-medium">最近应用的初稿</h3>
              <Badge variant="neutral">
                {modeLabel(draft.currentDraft.mode)}
              </Badge>
            </div>
            <p className="text-xs text-ink-2">
              来源映射对应初稿生成时的文字，作者修改后可能不再一一对应。
            </p>
            <Provenance
              sourceMap={draft.currentDraft.sourceMap}
              evidenceGaps={draft.currentDraft.evidenceGaps}
              titles={sourceTitles}
            />
          </div>
        )}
        {draft.candidates.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-medium">候选初稿</h3>
            {draft.candidates.map((candidate) => (
              <details key={candidate.id} className="rounded-sm border p-4">
                <summary className="cursor-pointer">
                  {candidate.title}
                  <span className="ml-2 text-xs text-ink-2">
                    {new Date(candidate.createdAt).toLocaleString("zh-CN")}
                  </span>
                </summary>
                <div className="mt-3 space-y-4">
                  <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-7">
                    {candidate.markdown}
                  </pre>
                  <Provenance
                    sourceMap={candidate.sourceMap}
                    evidenceGaps={candidate.evidenceGaps}
                    titles={sourceTitles}
                  />
                  <div className="flex flex-wrap gap-3">
                    <Button
                      type="button"
                      disabled={pending || Boolean(jobId)}
                      onClick={() => void apply(candidate)}
                    >
                      替换正文
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={pending}
                      onClick={() => void discard(candidate)}
                    >
                      丢弃
                    </Button>
                  </div>
                </div>
              </details>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
