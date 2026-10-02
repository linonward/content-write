"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { request } from "@/modules/articles/client/request";

type Material = {
  id: string;
  title: string;
  kind: string;
  currentVersion: number;
};
type Analysis = {
  result: {
    summary: string;
    claims: { text: string; kind: string }[];
    angles: { title: string }[];
  };
} | null;
type Brief = { workingTitle: string; audience: string; thesis: string };

const MAX_MATERIALS = 10;
const kindLabels: Record<string, string> = {
  text: "文字",
  markdown: "Markdown",
  link: "链接",
};

/**
 * Brief suggestion from the first chosen material: its first writing angle and
 * the author's own opinion where there is one. The author edits it before creating.
 */
function suggestBrief(material: Material, analysis: Analysis): Partial<Brief> {
  if (!analysis) return { workingTitle: material.title };
  const { claims, angles, summary } = analysis.result;
  const opinion =
    claims.find((claim) => claim.kind === "author_opinion") ?? claims[0];
  return {
    workingTitle: (angles[0]?.title ?? material.title).slice(0, 200),
    thesis: (opinion?.text ?? summary).slice(0, 500),
  };
}

export function FrameworkDialog({
  open,
  onOpenChange,
  breakdownId,
  frameworkName,
  slotCount,
  audience,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  breakdownId: string;
  frameworkName: string;
  slotCount: number;
  audience: string;
}) {
  const router = useRouter();
  const [materials, setMaterials] = useState<Material[] | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [brief, setBrief] = useState<Brief>({
    workingTitle: "",
    audience: audience.slice(0, 200),
    thesis: "",
  });
  const [edited, setEdited] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    void request<{ materials: Material[] }>("/materials?status=analyzed")
      .then((response) => setMaterials(response.materials))
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : "加载素材失败。"),
      );
  }, [open]);

  const first = materials?.find((material) => material.id === chosen[0]);
  useEffect(() => {
    if (!first || edited) return;
    let live = true;
    void request<{ analysis: Analysis }>(`/materials/${first.id}/analysis`)
      .then((response) => {
        if (live)
          setBrief((current) => ({
            ...current,
            ...suggestBrief(first, response.analysis),
          }));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [first, edited]);

  function toggle(id: string) {
    setChosen((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : current.length < MAX_MATERIALS
          ? [...current, id]
          : current,
    );
  }
  function edit(patch: Partial<Brief>) {
    setEdited(true);
    setBrief((current) => ({ ...current, ...patch }));
  }

  async function create() {
    if (!materials) return;
    setPending(true);
    setError("");
    try {
      const { articleId } = await request<{ articleId: string }>("/articles", {
        method: "POST",
        body: JSON.stringify({
          breakdownId,
          materials: chosen.map((id) => ({
            id,
            version: materials.find((material) => material.id === id)
              ?.currentVersion,
          })),
          brief: {
            workingTitle: brief.workingTitle.trim(),
            audience: brief.audience.trim(),
            thesis: brief.thesis.trim(),
          },
        }),
      });
      router.push(`/articles/${articleId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "创建文章失败。");
      setPending(false);
    }
  }

  const ready =
    chosen.length > 0 &&
    brief.workingTitle.trim() &&
    brief.audience.trim() &&
    brief.thesis.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>用这个框架写</DialogTitle>
          <DialogDescription>
            框架 · {frameworkName} · {slotCount}{" "}
            段。框架只决定结构，论据只来自你选的素材。
          </DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <section aria-label="选择你的素材" className="grid gap-2">
          <div className="flex items-baseline justify-between text-sm">
            <h3 className="font-medium">选择你的素材</h3>
            <span className="text-muted-foreground">
              已选 {chosen.length} / {MAX_MATERIALS}
            </span>
          </div>
          {materials === null ? (
            <p className="text-sm text-muted-foreground">加载中…</p>
          ) : materials.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              还没有已整理的素材。先在素材箱保存并整理你自己的素材。
            </p>
          ) : (
            <ul className="max-h-56 overflow-y-auto rounded-md border">
              {materials.map((material) => (
                <li key={material.id} className="border-b last:border-b-0">
                  <label
                    className={cn(
                      "flex cursor-pointer items-start gap-3 px-3 py-2.5 text-sm",
                      chosen.includes(material.id) && "bg-secondary",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={chosen.includes(material.id)}
                      disabled={
                        !chosen.includes(material.id) &&
                        chosen.length >= MAX_MATERIALS
                      }
                      onChange={() => toggle(material.id)}
                    />
                    <span className="grid min-w-0 gap-0.5">
                      <span className="truncate font-medium">
                        {material.title}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {kindLabels[material.kind] ?? material.kind} · 版本{" "}
                        {material.currentVersion} · 已整理
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            只列出当前版本已整理的素材；参考文章不能作为素材。
          </p>
        </section>
        <section aria-label="文章 brief" className="grid gap-2">
          <h3 className="text-sm font-medium">
            文章 brief（按框架与素材预填，可修改）
          </h3>
          <FieldGroup className="gap-3">
            <Field>
              <FieldLabel htmlFor="framework-title">工作标题</FieldLabel>
              <Input
                id="framework-title"
                value={brief.workingTitle}
                maxLength={200}
                onChange={(event) => edit({ workingTitle: event.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="framework-audience">目标读者</FieldLabel>
              <Input
                id="framework-audience"
                value={brief.audience}
                maxLength={200}
                onChange={(event) => edit({ audience: event.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="framework-thesis">核心观点</FieldLabel>
              <Textarea
                id="framework-thesis"
                value={brief.thesis}
                maxLength={500}
                rows={3}
                onChange={(event) => edit({ thesis: event.target.value })}
              />
            </Field>
          </FieldGroup>
        </section>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button
            type="button"
            disabled={!ready || pending}
            onClick={() => void create()}
          >
            {pending ? "创建中…" : "创建文章"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
