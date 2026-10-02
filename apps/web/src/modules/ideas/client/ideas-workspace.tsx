"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { AiConsentNotice } from "@/modules/ai/client/ai-consent-notice";
import { type AiMode, modeLabel, modeNote } from "@/modules/ai/client/ai-mode";

type Material = {
  id: string;
  title: string;
  currentVersion: number;
  summary: string;
  tags: string[];
};
type Source = {
  materialId: string;
  materialVersion: number;
  title: string;
  summary: string;
};
type Idea = {
  id: string;
  title: string;
  audience: string;
  thesis: string;
  rationale: string;
  evidenceGaps: string[];
  suggestedStructure: string[];
  status: "new" | "saved" | "ignored";
  mode: string;
  sources: Source[];
};
type Job = { id: string; status: string; errorCode: string | null };
const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}/api${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const payload = (await response.json()) as T & {
    error?: { message?: string };
  };
  if (!response.ok)
    throw new Error(payload.error?.message ?? "请求失败，请稍后重试。");
  return payload;
}

export function IdeasWorkspace() {
  const router = useRouter();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [materialsHasMore, setMaterialsHasMore] = useState(false);
  const [generationAvailable, setGenerationAvailable] = useState(false);
  const [aiMode, setAiMode] = useState<AiMode>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"visible" | "saved" | "ignored">(
    "visible",
  );
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    const [sources, listing] = await Promise.all([
      request<{
        materials: Material[];
        hasMore: boolean;
        generationAvailable: boolean;
        aiMode: AiMode;
      }>("/ideas/materials"),
      request<{ ideas: Idea[]; latestJob: Job | null }>("/ideas"),
    ]);
    setMaterials(sources.materials);
    setMaterialsHasMore(sources.hasMore);
    setGenerationAvailable(sources.generationAvailable);
    setAiMode(sources.aiMode);
    setIdeas(listing.ideas);
    setSelected((previous) =>
      previous.filter((id) =>
        sources.materials.some((material) => material.id === id),
      ),
    );
    if (
      listing.latestJob &&
      ["queued", "running"].includes(listing.latestJob.status)
    )
      setJobId(listing.latestJob.id);
    else {
      setJobId(null);
      if (listing.latestJob?.status === "failed")
        setError("上次选题生成失败，请确认素材后重新尝试。");
      if (listing.latestJob?.status === "stale")
        setError("上次选题任务的素材版本已变化，请重选素材。");
    }
  }, []);

  useEffect(() => {
    void refresh()
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : "加载选题失败。"),
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
            setJobId(null);
            await refresh();
            if (live) setNotice("选题已生成，可查看来源并收藏。 ");
          } else if (["failed", "stale"].includes(job.status)) {
            setJobId(null);
            setError(
              job.status === "stale"
                ? "素材版本已变化，请刷新后重选。"
                : "生成失败，请重新尝试。",
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

  function toggle(id: string) {
    setError("");
    setSelected((previous) =>
      previous.includes(id)
        ? previous.filter((value) => value !== id)
        : previous.length < 10
          ? [...previous, id]
          : previous,
    );
  }

  async function generate() {
    if (selected.length < 1 || selected.length > 10 || pending || jobId) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      const sources = selected.map((id) => {
        const material = materials.find((item) => item.id === id);
        if (!material) throw new Error("素材已变化，请刷新后重选。");
        return { id, version: material.currentVersion };
      });
      const response = await request<{ jobId: string }>("/ideas/generate", {
        method: "POST",
        headers: { "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ sources }),
      });
      setJobId(response.jobId);
      setNotice("任务已创建，刷新页面后仍可继续查看进度。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "生成失败，请重试。");
    } finally {
      setPending(false);
    }
  }

  async function changeStatus(id: string, status: Idea["status"]) {
    setPending(true);
    setError("");
    try {
      await request(`/ideas/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setIdeas((previous) =>
        previous.map((item) => (item.id === id ? { ...item, status } : item)),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "更新选题失败。");
    } finally {
      setPending(false);
    }
  }

  async function createArticle(ideaId: string) {
    setPending(true);
    setError("");
    try {
      const result = await request<{ articleId: string }>("/articles", {
        method: "POST",
        body: JSON.stringify({ ideaId }),
      });
      router.push(`/articles/${result.articleId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "创建文章失败。");
    } finally {
      setPending(false);
    }
  }

  const shown = ideas.filter((idea) =>
    filter === "visible" ? idea.status !== "ignored" : idea.status === filter,
  );
  return (
    <div className="space-y-8">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {error}{" "}
            <Button
              variant="secondary"
              type="button"
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
      <Card>
        <CardHeader>
          <CardTitle>选择已整理素材</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-ink-2">
            {generationAvailable
              ? modeNote(aiMode)
              : "当前未配置可用的生成服务。"}{" "}
            所有来源说法都需要作者核对。
          </p>
          <AiConsentNotice />
          {loading ? (
            <p>加载中…</p>
          ) : materials.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>还没有已整理素材</EmptyTitle>
                <EmptyDescription>
                  先到素材箱处理至少一条素材的当前版本。
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {materials.map((material) => (
                <label
                  key={material.id}
                  className="flex cursor-pointer gap-3 rounded-sm border p-4 has-checked:border-accent has-checked:bg-accent-soft"
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selected.includes(material.id)}
                    onChange={() => toggle(material.id)}
                    disabled={
                      !selected.includes(material.id) && selected.length >= 10
                    }
                  />
                  <span className="min-w-0">
                    <strong className="block">{material.title}</strong>
                    <span className="text-xs text-ink-2">
                      版本 {material.currentVersion}
                    </span>
                    <span className="mt-2 block text-sm text-ink-2">
                      {material.summary}
                    </span>
                    {material.tags.length > 0 && (
                      <span className="mt-2 flex flex-wrap gap-1">
                        {material.tags.map((tag) => (
                          <Badge key={tag} variant="muted">
                            {tag}
                          </Badge>
                        ))}
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          )}
          {materialsHasMore && (
            <p className="text-xs text-ink-2">
              当前显示最近 100 条已整理素材。
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={() => void generate()}
              disabled={
                !generationAvailable ||
                selected.length === 0 ||
                Boolean(jobId) ||
                pending
              }
            >
              {jobId ? "生成中…" : pending ? "提交中…" : "生成 3 个选题"}
            </Button>
            <span className="text-sm text-ink-2">
              已选择 {selected.length} / 10 条
            </span>
          </div>
        </CardContent>
      </Card>
      <section aria-label="生成的选题" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-medium">我的选题</h2>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={filter === "visible" ? "primary" : "secondary"}
              onClick={() => setFilter("visible")}
            >
              待看
            </Button>
            <Button
              type="button"
              variant={filter === "saved" ? "primary" : "secondary"}
              onClick={() => setFilter("saved")}
            >
              收藏
            </Button>
            <Button
              type="button"
              variant={filter === "ignored" ? "primary" : "secondary"}
              onClick={() => setFilter("ignored")}
            >
              已忽略
            </Button>
          </div>
        </div>
        {loading ? (
          <p>加载中…</p>
        ) : shown.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>这里暂时没有选题</EmptyTitle>
              <EmptyDescription>选择已整理素材后主动生成。</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          shown.map((idea) => (
            <Card key={idea.id}>
              <CardHeader>
                <CardTitle>{idea.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Badge variant="muted">
                    {idea.status === "saved"
                      ? "已收藏"
                      : idea.status === "ignored"
                        ? "已忽略"
                        : "待看"}
                  </Badge>
                  <Badge variant="neutral">{modeLabel(idea.mode)}</Badge>
                </div>
                <p>
                  <strong>目标读者：</strong>
                  {idea.audience}
                </p>
                <p>
                  <strong>核心主张：</strong>
                  {idea.thesis}
                </p>
                <p>
                  <strong>素材如何支持：</strong>
                  {idea.rationale}
                </p>
                <div>
                  <strong>证据缺口</strong>
                  <ul className="mt-1 list-disc pl-5">
                    {idea.evidenceGaps.map((gap) => (
                      <li key={gap}>{gap}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <strong>建议结构</strong>
                  <ol className="mt-1 list-decimal pl-5">
                    {idea.suggestedStructure.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </div>
                <details className="rounded-sm border p-3">
                  <summary className="cursor-pointer font-medium">
                    查看引用素材（{idea.sources.length}）
                  </summary>
                  <ul className="mt-3 space-y-3">
                    {idea.sources.map((source) => (
                      <li key={source.materialId}>
                        <strong>{source.title}</strong>{" "}
                        <span className="text-xs text-ink-2">
                          版本 {source.materialVersion}
                        </span>
                        <p className="text-sm text-ink-2">{source.summary}</p>
                      </li>
                    ))}
                  </ul>
                </details>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    disabled={pending || idea.status === "ignored"}
                    onClick={() => void createArticle(idea.id)}
                  >
                    创建文章并规划大纲
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={pending || idea.status === "saved"}
                    onClick={() => void changeStatus(idea.id, "saved")}
                  >
                    收藏
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={pending || idea.status === "ignored"}
                    onClick={() => void changeStatus(idea.id, "ignored")}
                  >
                    忽略
                  </Button>
                  {idea.status !== "new" && (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => void changeStatus(idea.id, "new")}
                    >
                      恢复待看
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </section>
    </div>
  );
}
