"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { AiConsentNotice } from "@/modules/ai/client/ai-consent-notice";
import { type AiMode, modeLabel, modeNote } from "@/modules/ai/client/ai-mode";
import { DraftPanel, type DraftState } from "./draft-panel";
import {
  type Framework,
  FrameworkPicker,
  FrameworkTag,
} from "./framework-panel";
import { request } from "./request";
import { RevisionHistory } from "./revision-history";

type Section = {
  heading: string;
  purpose: string;
  keyPoints: string[];
  evidenceIds: string[];
  missingEvidence: string[];
  slotId?: string;
};
type Outline = {
  workingTitle: string;
  audience: string;
  thesis: string;
  sections: Section[];
};
type Source = {
  materialId: string;
  materialVersion: number;
  title: string | null;
  summary: string | null;
  evidenceSpans: { id: string; quote: string }[];
};
type Article = DraftState & {
  id: string;
  workingTitle: string;
  audience: string;
  thesis: string;
  sourceCount: number;
  version: number;
  outline: Outline | null;
  outlineConfirmedAt: string | null;
  breakdownId: string | null;
  referenceArticleId: string | null;
  framework: Framework | null;
  sources: Source[];
};
type Job = { id: string; status: string; errorCode: string | null };

function blankOutline(article: Article): Outline {
  return {
    workingTitle: article.workingTitle,
    audience: article.audience,
    thesis: article.thesis,
    sections: [0, 1].map(() => ({
      heading: "",
      purpose: "",
      keyPoints: [""],
      evidenceIds: [],
      missingEvidence: [],
    })),
  };
}
function lines(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function OutlineWorkspace({ id }: { id: string }) {
  const [article, setArticle] = useState<Article | null>(null);
  const [brief, setBrief] = useState({
    workingTitle: "",
    audience: "",
    thesis: "",
  });
  const [outline, setOutline] = useState<Outline | null>(null);
  const [sectionKeys, setSectionKeys] = useState<string[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [draftJob, setDraftJob] = useState<Job | null>(null);
  const [generationAvailable, setGenerationAvailable] = useState(false);
  const [aiMode, setAiMode] = useState<AiMode>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    const result = await request<{
      article: Article;
      latestJob: Job | null;
      latestDraftJob: Job | null;
      generationAvailable: boolean;
      aiMode: AiMode;
    }>(`/articles/${id}`);
    setArticle(result.article);
    setDraftJob(result.latestDraftJob);
    setGenerationAvailable(result.generationAvailable);
    setAiMode(result.aiMode);
    setBrief({
      workingTitle: result.article.workingTitle,
      audience: result.article.audience,
      thesis: result.article.thesis,
    });
    const nextOutline = result.article.outline ?? blankOutline(result.article);
    setOutline(nextOutline);
    setSectionKeys(nextOutline.sections.map(() => crypto.randomUUID()));
    setJobId(
      result.latestJob &&
        ["queued", "running"].includes(result.latestJob.status)
        ? result.latestJob.id
        : null,
    );
    if (result.latestJob?.status === "failed")
      setError("上次大纲生成失败，请检查来源后重试。");
    if (result.latestJob?.status === "stale")
      setError("上次大纲任务因文章或来源变化而失效，请刷新后重试。");
  }, [id]);
  useEffect(() => {
    void refresh()
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : "加载文章失败。"),
      )
      .finally(() => setLoading(false));
  }, [refresh]);
  useEffect(() => {
    if (!jobId) return;
    let live = true;
    const timer = setInterval(() => {
      void request<{ job: Job }>(`/jobs/${jobId}`)
        .then(async ({ job }) => {
          if (!live) return;
          if (job.status === "succeeded") {
            // Clearing jobId ends this effect, so set the notice before that.
            setNotice("大纲已生成，请检查并修改后确认。");
            setJobId(null);
            await refresh();
          } else if (["failed", "stale"].includes(job.status)) {
            setJobId(null);
            setError(
              job.status === "stale"
                ? "文章或来源已变化，请刷新后重试。"
                : "大纲生成失败，请重试。",
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
  }, [jobId, refresh]);

  async function saveBrief() {
    if (!article || pending) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      await request(`/articles/${id}/brief`, {
        method: "PATCH",
        body: JSON.stringify({ ...brief, expectedVersion: article.version }),
      });
      await refresh();
      setNotice("写作 brief 已保存；原大纲及确认状态已清除。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败。");
    } finally {
      setPending(false);
    }
  }
  async function generate() {
    if (!article || pending || jobId) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      const result = await request<{ jobId: string }>(
        `/articles/${id}/outline/generate`,
        {
          method: "POST",
          headers: { "idempotency-key": crypto.randomUUID() },
          body: JSON.stringify({ expectedVersion: article.version }),
        },
      );
      setJobId(result.jobId);
      setNotice("大纲任务已创建，刷新页面后仍可查看进度。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "生成失败。");
    } finally {
      setPending(false);
    }
  }
  async function saveOutline() {
    if (!article || !outline || pending) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      await request(`/articles/${id}/outline`, {
        method: "PUT",
        body: JSON.stringify({ expectedVersion: article.version, outline }),
      });
      await refresh();
      setNotice("大纲已保存。若此前已确认，现在需要重新确认。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存大纲失败。");
    } finally {
      setPending(false);
    }
  }
  async function confirm() {
    if (!article || pending) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      await request(`/articles/${id}/outline/confirm`, {
        method: "POST",
        body: JSON.stringify({ expectedVersion: article.version }),
      });
      await refresh();
      setNotice("大纲已确认，可以生成初稿。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "确认失败。");
    } finally {
      setPending(false);
    }
  }
  function updateSection(index: number, patch: Partial<Section>) {
    setOutline((previous) =>
      previous
        ? {
            ...previous,
            sections: previous.sections.map((section, position) =>
              position === index ? { ...section, ...patch } : section,
            ),
          }
        : previous,
    );
  }
  function removeSection(index: number) {
    if (!outline) return;
    setOutline({
      ...outline,
      sections: outline.sections.filter((_, position) => position !== index),
    });
    setSectionKeys((previous) =>
      previous.filter((_, position) => position !== index),
    );
  }
  function addSection() {
    if (!outline) return;
    setOutline({
      ...outline,
      sections: [
        ...outline.sections,
        {
          heading: "",
          purpose: "",
          keyPoints: [""],
          evidenceIds: [],
          missingEvidence: [],
        },
      ],
    });
    setSectionKeys((previous) => [...previous, crypto.randomUUID()]);
  }
  if (loading) return <p>加载中…</p>;
  if (!article || !outline)
    return (
      <Alert variant="destructive">
        <AlertDescription>{error || "文章不存在。"}</AlertDescription>
      </Alert>
    );
  const briefDirty =
    brief.workingTitle !== article.workingTitle ||
    brief.audience !== article.audience ||
    brief.thesis !== article.thesis;
  const outlineDirty =
    JSON.stringify(outline) !== JSON.stringify(article.outline);
  return (
    <div className="space-y-7 pb-16">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {error}{" "}
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                void refresh()
                  .then(() => setError(""))
                  .catch((cause: unknown) =>
                    setError(
                      cause instanceof Error ? cause.message : "刷新失败。",
                    ),
                  )
              }
            >
              刷新
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert role="status">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap gap-2">
        <Badge variant="muted">版本 {article.version}</Badge>
        <Badge variant="neutral">
          {article.outlineConfirmedAt
            ? "大纲已确认"
            : article.outline
              ? "大纲待确认"
              : "尚无大纲"}
        </Badge>
        <Badge variant="neutral">
          {modeLabel(generationAvailable ? aiMode : null)}
        </Badge>
        {article.framework && (
          <FrameworkTag
            framework={article.framework}
            referenceArticleId={article.referenceArticleId}
          />
        )}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>写作 brief</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="brief-title">工作标题</Label>
            <Input
              id="brief-title"
              value={brief.workingTitle}
              maxLength={200}
              onChange={(event) =>
                setBrief({ ...brief, workingTitle: event.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="brief-audience">目标读者</Label>
            <Input
              id="brief-audience"
              value={brief.audience}
              maxLength={200}
              onChange={(event) =>
                setBrief({ ...brief, audience: event.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="brief-thesis">核心观点</Label>
            <Textarea
              id="brief-thesis"
              value={brief.thesis}
              maxLength={500}
              onChange={(event) =>
                setBrief({ ...brief, thesis: event.target.value })
              }
            />
          </div>
          <p className="text-sm text-ink-2">
            修改 brief 并保存会清除原大纲与确认状态。
          </p>
          <Button
            type="button"
            variant="secondary"
            disabled={!briefDirty || pending || Boolean(jobId)}
            onClick={() => void saveBrief()}
          >
            保存 brief
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>引用素材</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {article.sources.length !== article.sourceCount && (
            <Alert variant="destructive">
              <AlertDescription>
                部分来源已删除，大纲生成和保存不可用。
              </AlertDescription>
            </Alert>
          )}
          {article.sources.length ? (
            article.sources.map((source) => (
              <div key={source.materialId} className="rounded-sm border p-3">
                <strong>{source.title ?? "已删除素材"}</strong>{" "}
                <span className="text-xs text-ink-2">
                  版本 {source.materialVersion}
                </span>
                <p className="mt-1 text-sm text-ink-2">
                  {source.summary ?? "来源分析已失效"}
                </p>
                {source.evidenceSpans.map((span) => (
                  <p key={span.id} className="mt-1 text-xs text-ink-2">
                    片段 {span.id}：{span.quote}
                  </p>
                ))}
              </div>
            ))
          ) : (
            <p className="text-sm text-ink-2">来源已删除，无法生成大纲。</p>
          )}
        </CardContent>
      </Card>
      <FrameworkPicker
        articleId={id}
        version={article.version}
        breakdownId={article.breakdownId}
        hasFramework={Boolean(article.framework)}
        hasOutline={Boolean(article.outline)}
        disabled={pending || Boolean(jobId) || briefDirty || outlineDirty}
        onChanged={async (message) => {
          await refresh();
          setNotice(message);
        }}
        onError={setError}
      />
      <Card>
        <CardHeader>
          <CardTitle>
            {article.framework ? "文章大纲 · 按框架生成" : "文章大纲"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-ink-2">
            {generationAvailable
              ? `${modeNote(aiMode)}片段关联是写作线索，事实仍需作者核对。`
              : "当前未配置可用的生成服务；仍可手动编辑大纲。"}
          </p>
          <AiConsentNotice />
          <Button
            type="button"
            disabled={
              pending ||
              Boolean(jobId) ||
              briefDirty ||
              !generationAvailable ||
              article.sources.length !== article.sourceCount
            }
            onClick={() => void generate()}
          >
            {jobId
              ? "生成中…"
              : article.framework
                ? "按框架和 brief 生成大纲"
                : "根据 brief 生成大纲"}
          </Button>
          <div className="space-y-2">
            <Label htmlFor="outline-title">大纲标题</Label>
            <Input
              id="outline-title"
              value={outline.workingTitle}
              maxLength={200}
              onChange={(event) =>
                setOutline({ ...outline, workingTitle: event.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="outline-audience">目标读者</Label>
            <Input
              id="outline-audience"
              value={outline.audience}
              maxLength={200}
              onChange={(event) =>
                setOutline({ ...outline, audience: event.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="outline-thesis">核心观点</Label>
            <Textarea
              id="outline-thesis"
              value={outline.thesis}
              maxLength={500}
              onChange={(event) =>
                setOutline({ ...outline, thesis: event.target.value })
              }
            />
          </div>
          {outline.sections.map((section, index) => {
            const slotIndex =
              article.framework?.slots.findIndex(
                (slot) => slot.id === section.slotId,
              ) ?? -1;
            const slot = article.framework?.slots[slotIndex];
            // A slot the author's materials cannot support is shown as a gap, not filled in.
            const gap = Boolean(slot) && section.evidenceIds.length === 0;
            return (
              <div
                key={sectionKeys[index]}
                className={cn(
                  "space-y-3 rounded-sm border p-4",
                  gap && "border-evidence bg-evidence-soft",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="flex flex-wrap items-center gap-2 font-medium">
                    第 {index + 1} 节
                    {slot && (
                      <Badge variant="accent" title={`手法：${slot.technique}`}>
                        槽位 {slotIndex + 1} · {slot.name}
                      </Badge>
                    )}
                    {gap && <Badge variant="evidence">缺少素材</Badge>}
                  </h3>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={outline.sections.length <= 2 || pending}
                    onClick={() => removeSection(index)}
                  >
                    删除本节
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`heading-${index}`}>小节标题</Label>
                  <Input
                    id={`heading-${index}`}
                    value={section.heading}
                    maxLength={200}
                    onChange={(event) =>
                      updateSection(index, { heading: event.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`purpose-${index}`}>本节目的</Label>
                  <Textarea
                    id={`purpose-${index}`}
                    value={section.purpose}
                    maxLength={500}
                    onChange={(event) =>
                      updateSection(index, { purpose: event.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`points-${index}`}>要点（每行一条）</Label>
                  <Textarea
                    id={`points-${index}`}
                    value={section.keyPoints.join("\n")}
                    onChange={(event) =>
                      updateSection(index, {
                        keyPoints: event.target.value.split("\n"),
                      })
                    }
                  />
                </div>
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">引用片段</legend>
                  {article.sources.flatMap((source) =>
                    source.evidenceSpans.map((span) => {
                      const evidenceId = `${source.materialId}:${span.id}`;
                      return (
                        <label key={evidenceId} className="flex gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={section.evidenceIds.includes(evidenceId)}
                            onChange={() =>
                              updateSection(index, {
                                evidenceIds: section.evidenceIds.includes(
                                  evidenceId,
                                )
                                  ? section.evidenceIds.filter(
                                      (item) => item !== evidenceId,
                                    )
                                  : [...section.evidenceIds, evidenceId],
                              })
                            }
                          />
                          <span>
                            {source.title}：{span.quote}
                          </span>
                        </label>
                      );
                    }),
                  )}
                </fieldset>
                <div className="space-y-2">
                  <Label htmlFor={`missing-${index}`}>
                    待补证据（每行一条）
                  </Label>
                  <Textarea
                    id={`missing-${index}`}
                    value={section.missingEvidence.join("\n")}
                    onChange={(event) =>
                      updateSection(index, {
                        missingEvidence: lines(event.target.value),
                      })
                    }
                  />
                </div>
              </div>
            );
          })}
          {article.framework && (
            <p className="text-xs text-ink-2">
              证据只来自本文绑定的 {article.sourceCount}{" "}
              条素材；参考文章不会作为证据出现。
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="secondary"
              disabled={outline.sections.length >= 10 || pending}
              onClick={addSection}
            >
              添加小节
            </Button>
            <Button
              type="button"
              disabled={
                pending ||
                Boolean(jobId) ||
                !outlineDirty ||
                article.sources.length !== article.sourceCount
              }
              onClick={() => void saveOutline()}
            >
              保存大纲
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={
                pending ||
                !article.outline ||
                Boolean(article.outlineConfirmedAt) ||
                outlineDirty ||
                article.sources.length !== article.sourceCount
              }
              onClick={() => void confirm()}
            >
              确认大纲
            </Button>
          </div>
          {outlineDirty && article.outline && (
            <p className="text-sm text-ink-2">
              当前修改尚未保存；保存后可重新确认。
            </p>
          )}
        </CardContent>
      </Card>
      <DraftPanel
        articleId={id}
        draft={article}
        latestJob={draftJob}
        generationAvailable={generationAvailable}
        aiMode={aiMode}
        blockedReason={
          article.sources.length !== article.sourceCount
            ? "部分来源已删除，无法生成初稿。"
            : outlineDirty || briefDirty
              ? "有未保存的修改，保存并确认大纲后再生成。"
              : null
        }
        sourceTitles={
          new Map(
            article.sources.map((source) => [
              source.materialId,
              source.title ?? "已删除素材",
            ]),
          )
        }
        onChanged={refresh}
        onBodySaved={(saved) =>
          setArticle((previous) =>
            previous ? { ...previous, ...saved } : previous,
          )
        }
      />
      <RevisionHistory
        articleId={id}
        currentVersion={article.version}
        onRestored={refresh}
      />
    </div>
  );
}
