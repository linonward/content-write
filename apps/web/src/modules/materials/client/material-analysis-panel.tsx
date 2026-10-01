"use client";

import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Analysis = {
  summary: string;
  tags: string[];
  claims: {
    text: string;
    kind: "source_claim" | "author_opinion";
    evidenceIds: string[];
  }[];
  angles: { title: string; rationale: string }[];
  evidenceSpans: { id: string; quote: string; start: number; end: number }[];
};
type AnalysisResponse = {
  currentVersion: number;
  processingAvailable: boolean;
  hasContent: boolean;
  job: { id: string; status: string } | null;
  analysis: { materialVersion: number; mode: string; result: Analysis } | null;
};
type JobResponse = {
  job: {
    status: string;
    errorCode: string | null;
    analysis: { mode: string; result: Analysis } | null;
  };
};
const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}/api${path}`, {
    ...init,
    credentials: "include",
  });
  const payload = (await response.json()) as T & {
    error?: { message?: string };
  };
  if (!response.ok)
    throw new Error(payload.error?.message ?? "处理失败，请稍后重试。");
  return payload;
}

export function MaterialAnalysisPanel({
  materialId,
  version,
  onStatusChange,
}: {
  materialId: string;
  version: number;
  onStatusChange?: () => void;
}) {
  const [analysis, setAnalysis] = useState<AnalysisResponse["analysis"]>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [failedJobId, setFailedJobId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [processingAvailable, setProcessingAvailable] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let live = true;
    setAnalysis(null);
    setJobId(null);
    setFailedJobId(null);
    setError("");
    setLoading(true);
    void request<AnalysisResponse>(`/materials/${materialId}/analysis`)
      .then((response) => {
        if (!live) return;
        setAnalysis(
          response.analysis?.materialVersion === version
            ? response.analysis
            : null,
        );
        setProcessingAvailable(response.processingAvailable);
        setHasContent(response.hasContent);
        if (response.job && ["queued", "running"].includes(response.job.status))
          setJobId(response.job.id);
        if (response.job?.status === "failed") {
          setError("上次处理失败，请重新整理。");
          setFailedJobId(response.job.id);
        }
        if (response.job?.status === "stale")
          setError("素材版本已变化，请重新整理。");
      })
      .catch((cause: unknown) => {
        if (live)
          setError(cause instanceof Error ? cause.message : "加载分析失败。");
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [materialId, version]);

  useEffect(() => {
    if (!jobId) return;
    let live = true;
    const timer = setInterval(() => {
      void request<JobResponse>(`/jobs/${jobId}`)
        .then((response) => {
          if (!live) return;
          if (response.job.status === "succeeded") {
            setAnalysis(
              response.job.analysis
                ? { materialVersion: version, ...response.job.analysis }
                : null,
            );
            setJobId(null);
            onStatusChange?.();
          } else if (["failed", "stale"].includes(response.job.status)) {
            setError(
              response.job.status === "stale"
                ? "素材已有新版本，请刷新后重新处理。"
                : "处理失败，请稍后重试。",
            );
            setJobId(null);
            onStatusChange?.();
            if (response.job.status === "failed") setFailedJobId(jobId);
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
  }, [jobId, version, onStatusChange]);

  async function start() {
    setError("");
    setStarting(true);
    try {
      const response = await request<{ jobId: string }>(
        failedJobId
          ? `/jobs/${failedJobId}/retry`
          : `/materials/${materialId}/process`,
        {
          method: "POST",
          headers: { "idempotency-key": crypto.randomUUID() },
        },
      );
      setJobId(response.jobId);
      setFailedJobId(null);
      onStatusChange?.();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "处理失败，请稍后重试。",
      );
    } finally {
      setStarting(false);
    }
  }

  const data = analysis?.result;
  return (
    <Card className="mt-7">
      <CardHeader>
        <CardTitle>素材整理</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          AI 整理仅归纳来源，不代表事实已核实。
          {processingAvailable
            ? "当前使用确定性 mock，结果不计入真实模型指标。"
            : "当前未配置处理服务。"}
        </p>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {loading ? (
          <p>加载中…</p>
        ) : data ? (
          <>
            <div>
              <h3 className="font-medium">摘要</h3>
              <p className="mt-2 whitespace-pre-wrap">{data.summary}</p>
            </div>
            {data.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {data.tags.map((tag) => (
                  <Badge key={tag}>{tag}</Badge>
                ))}
              </div>
            )}
            <div>
              <h3 className="font-medium">关键观点</h3>
              <ul className="mt-2 list-disc space-y-2 pl-5">
                {data.claims.map((claim) => (
                  <li
                    key={`${claim.kind}-${claim.text}-${claim.evidenceIds.join(",")}`}
                  >
                    {claim.text}{" "}
                    <span className="text-sm text-muted-foreground">
                      (
                      {claim.kind === "author_opinion"
                        ? "作者观点"
                        : "来源说法"}
                      ；片段 {claim.evidenceIds.join("、")})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-medium">可写角度</h3>
              <ul className="mt-2 space-y-2">
                {data.angles.map((angle) => (
                  <li key={angle.title}>
                    <strong>{angle.title}</strong>
                    <p className="text-sm text-muted-foreground">
                      {angle.rationale}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-medium">来源片段</h3>
              <ul className="mt-2 space-y-2">
                {data.evidenceSpans.map((span) => (
                  <li key={span.id} className="rounded-md bg-muted p-3 text-sm">
                    {span.id} · 「{span.quote}」{" "}
                    <span className="text-muted-foreground">
                      [{span.start}, {span.end})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : (
          <Button
            type="button"
            disabled={
              Boolean(jobId) || starting || !processingAvailable || !hasContent
            }
            onClick={() => void start()}
          >
            {jobId
              ? "处理中…"
              : starting
                ? "提交中…"
                : !hasContent
                  ? "请先粘贴正文"
                  : processingAvailable
                    ? failedJobId
                      ? "重试处理"
                      : "整理当前版本"
                    : "处理服务未配置"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
