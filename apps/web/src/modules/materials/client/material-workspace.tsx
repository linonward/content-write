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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Material = {
  id: string;
  title: string;
  content: string;
  kind: "text" | "markdown" | "link";
  sourceFilename: string | null;
  sourceUrl: string | null;
  fetchStatus: "fetched" | "failed" | "disabled" | "manual" | null;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
};
type Summary = Omit<Material, "content">;

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}/api/materials${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(typeof init?.body === "string"
        ? { "content-type": "application/json" }
        : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(payload?.error?.message ?? "请求失败，请稍后重试。");
  }
  return response.status === 204
    ? (undefined as T)
    : ((await response.json()) as T);
}

export function MaterialWorkspace() {
  const [items, setItems] = useState<Summary[]>([]);
  const [selected, setSelected] = useState<Material | null>(null);
  const [mode, setMode] = useState<"create" | "view" | "edit">("create");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [remoteFetchEnabled, setRemoteFetchEnabled] = useState(false);
  const [fetchRequested, setFetchRequested] = useState(true);

  const refresh = useCallback(async () => {
    const result = await api<{ materials: Summary[] }>("");
    setItems(result.materials);
  }, []);

  useEffect(() => {
    refresh()
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : "加载失败。"),
      )
      .finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    api<{ remoteFetchEnabled: boolean }>("/link-capabilities")
      .then((result) => setRemoteFetchEnabled(result.remoteFetchEnabled))
      .catch(() => setRemoteFetchEnabled(false));
  }, []);

  async function open(id: string) {
    setError("");
    setNotice("");
    try {
      const result = await api<{ material: Material }>(`/${id}`);
      setSelected(result.material);
      setTitle(result.material.title);
      setContent(result.material.content);
      setMode("view");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "加载失败。");
    }
  }

  function startCreate() {
    setSelected(null);
    setTitle("");
    setContent("");
    setMode("create");
    setError("");
    setNotice("");
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanedTitle = title.trim();
    const cleanedContent = content.trim();
    if (
      !cleanedTitle ||
      !cleanedContent ||
      cleanedTitle.length > 200 ||
      cleanedContent.length > 50_000
    ) {
      setError("请填写标题和正文；标题最多 200 字，正文最多 50000 字。");
      return;
    }
    setPending(true);
    setError("");
    setNotice("");
    try {
      const editing = mode === "edit" && selected;
      const result = await api<{ material: Material }>(
        editing ? `/${selected.id}` : "",
        {
          method: editing ? "PATCH" : "POST",
          body: JSON.stringify({
            title: cleanedTitle,
            content: cleanedContent,
            ...(editing ? { expectedVersion: selected.currentVersion } : {}),
          }),
        },
      );
      setSelected(result.material);
      setTitle(result.material.title);
      setContent(result.material.content);
      setMode("view");
      await refresh();
      setNotice(editing ? "素材已保存为新版本。" : "素材已保存。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败，请重试。");
    } finally {
      setPending(false);
    }
  }

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const file = new FormData(formElement).get("file");
    if (!(file instanceof File) || !file.name) {
      setError("请选择 .md 或 .txt 文件。");
      return;
    }
    if (!/\.(md|txt)$/i.test(file.name)) {
      setError("只支持 .md 和 .txt 文件。");
      return;
    }
    if (file.size > 1_048_576) {
      setError("文件不能超过 1 MiB。");
      return;
    }
    try {
      const content = new TextDecoder("utf-8", { fatal: true })
        .decode(await file.arrayBuffer())
        .replace(/^\uFEFF/, "");
      if (
        !content.trim() ||
        content.length > 50_000 ||
        content.includes("\u0000")
      ) {
        setError("文件正文不能为空，最多 50000 字，且不能包含空字符。");
        return;
      }
    } catch {
      setError("文件必须是 UTF-8 编码。");
      return;
    }
    setPending(true);
    setError("");
    setNotice("");
    try {
      const result = await api<{ material: Material }>("/import", {
        method: "POST",
        body: new FormData(formElement),
      });
      setSelected(result.material);
      setTitle(result.material.title);
      setContent(result.material.content);
      setMode("view");
      formElement.reset();
      await refresh();
      setNotice("文件已导入素材箱。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "导入失败，请重试。");
    } finally {
      setPending(false);
    }
  }

  async function saveLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const rawUrl = String(new FormData(formElement).get("url") ?? "").trim();
    let url: URL;
    try {
      url = new URL(rawUrl);
      if (
        !(["http:", "https:"] as string[]).includes(url.protocol) ||
        url.username ||
        url.password ||
        (url.port && !["80", "443"].includes(url.port))
      )
        throw new Error();
    } catch {
      setError("请输入不含账号密码、使用 80/443 端口的 HTTP 或 HTTPS 链接。");
      return;
    }
    setPending(true);
    setError("");
    setNotice("");
    try {
      const result = await api<{ material: Material }>("/link", {
        method: "POST",
        body: JSON.stringify({
          url: url.href,
          fetch: remoteFetchEnabled && fetchRequested,
        }),
      });
      setSelected(result.material);
      setTitle(result.material.title);
      setContent(result.material.content);
      setMode("view");
      formElement.reset();
      await refresh();
      setNotice(
        result.material.fetchStatus === "fetched"
          ? "网页文字已保存为素材，请核对原文和来源。"
          : result.material.fetchStatus === "failed"
            ? "链接已保存，抓取失败。可粘贴正文继续使用。"
            : "链接已保存。可粘贴正文继续使用。",
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "保存链接失败，请重试。",
      );
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!selected) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      await api<void>(`/${selected.id}`, { method: "DELETE" });
      await refresh();
      startCreate();
      setNotice("素材及其历史版本已删除。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除失败，请重试。");
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      className="grid grid-cols-[minmax(220px,300px)_minmax(0,1fr)] items-start gap-8 max-[680px]:grid-cols-1"
      aria-label="素材箱"
    >
      <Card className="min-h-[330px]">
        <CardHeader>
          <CardTitle>
            <h2>最近素材</h2>
          </CardTitle>
          <CardAction>
            <Button variant="ghost" type="button" onClick={startCreate}>
              + 新建
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">加载中…</p>
          ) : items.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>还没有素材</EmptyTitle>
                <EmptyDescription>写下第一条想法吧。</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="mt-2">
              {items.map((item) => (
                <li className="border-b last:border-b-0" key={item.id}>
                  <Button
                    type="button"
                    variant="ghost"
                    className={cn(
                      "h-auto w-full justify-start rounded-none px-2 py-3.5 text-left",
                      selected?.id === item.id && "bg-muted",
                    )}
                    onClick={() => void open(item.id)}
                  >
                    <span className="grid min-w-0 gap-1.5">
                      <strong className="truncate">{item.title}</strong>
                      <span className="text-xs text-muted-foreground">
                        {item.kind === "link"
                          ? "链接"
                          : item.sourceFilename
                            ? "文件导入"
                            : "文字"}{" "}
                        · 版本 {item.currentVersion} ·{" "}
                        {new Date(item.updatedAt).toLocaleDateString("zh-CN")}
                      </span>
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {items.length === 100 && (
            <p className="mt-3 text-xs text-muted-foreground">
              当前显示最近 100 条素材。
            </p>
          )}
        </CardContent>
      </Card>
      <Card className="min-h-[330px]">
        <CardHeader>
          <CardTitle>
            <h2>
              {mode === "create"
                ? "添加文字素材"
                : mode === "edit"
                  ? "编辑素材"
                  : selected?.title}
            </h2>
          </CardTitle>
          {selected && (
            <CardAction>
              <Badge variant="secondary">版本 {selected.currentVersion}</Badge>
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {notice && (
            <Alert role="status" className="mb-4">
              <AlertDescription>{notice}</AlertDescription>
            </Alert>
          )}
          {mode === "view" && selected ? (
            <>
              <p className="text-xs text-muted-foreground">
                更新于 {new Date(selected.updatedAt).toLocaleString("zh-CN")}
              </p>
              {selected.sourceFilename && (
                <p className="text-xs text-muted-foreground">
                  来源文件：{selected.sourceFilename} ·{" "}
                  {selected.kind === "markdown" ? "Markdown" : "纯文本"}
                </p>
              )}
              {selected.sourceUrl && (
                <p className="mt-2 text-xs text-muted-foreground wrap-anywhere">
                  来源链接：
                  <a
                    className="text-primary underline"
                    href={selected.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {selected.sourceUrl}
                  </a>
                  {selected.fetchStatus && (
                    <Badge variant="secondary" className="ml-2">
                      {selected.fetchStatus === "fetched"
                        ? "已抓取文字"
                        : selected.fetchStatus === "manual"
                          ? "手动粘贴"
                          : selected.fetchStatus === "failed"
                            ? "抓取失败"
                            : "未抓取"}
                    </Badge>
                  )}
                </p>
              )}
              {selected.content ? (
                <div className="mt-7 whitespace-pre-wrap wrap-anywhere leading-[1.8]">
                  {selected.content}
                </div>
              ) : selected.kind === "link" ? (
                <Empty className="mt-6">
                  <EmptyHeader>
                    <EmptyTitle>暂无正文</EmptyTitle>
                    <EmptyDescription>
                      可编辑素材并粘贴网页正文；不会根据链接编造内容。
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : null}
              <div className="mt-6 flex items-center gap-3">
                <Button
                  type="button"
                  onClick={() => {
                    setMode("edit");
                    setNotice("");
                  }}
                >
                  {selected.kind === "link" && !selected.content
                    ? "粘贴正文"
                    : "编辑"}
                </Button>
                <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                  <AlertDialogTrigger
                    render={<Button variant="destructive" disabled={pending} />}
                  >
                    删除
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>删除素材？</AlertDialogTitle>
                      <AlertDialogDescription>
                        将删除「{selected.title}
                        」及其全部历史版本，此操作不可恢复。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction
                        variant="destructive"
                        disabled={pending}
                        onClick={() => {
                          setDeleteOpen(false);
                          void remove();
                        }}
                      >
                        确认删除
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </>
          ) : (
            <form onSubmit={(event) => void save(event)}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="material-title">标题</FieldLabel>
                  <Input
                    id="material-title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    maxLength={200}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="material-content">
                    {selected?.kind === "link" && !selected.content
                      ? "粘贴正文"
                      : "正文"}
                  </FieldLabel>
                  <Textarea
                    id="material-content"
                    value={content}
                    onChange={(event) => setContent(event.target.value)}
                    maxLength={50_000}
                    rows={14}
                    required
                  />
                  <FieldDescription>
                    {content.length} / 50000
                    字。当前仅保存文字，不会自动调用模型。
                  </FieldDescription>
                </Field>
                <div className="flex items-center gap-3">
                  <Button type="submit" disabled={pending}>
                    {pending ? "保存中…" : "保存素材"}
                  </Button>
                  {mode === "edit" && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setMode("view");
                        setError("");
                      }}
                    >
                      取消
                    </Button>
                  )}
                </div>
              </FieldGroup>
            </form>
          )}
          {mode === "create" && (
            <>
              <Separator className="my-7" />
              <form onSubmit={(event) => void upload(event)}>
                <FieldGroup>
                  <h3 className="text-lg font-medium">从文件导入</h3>
                  <Field>
                    <FieldLabel htmlFor="material-file">
                      选择 Markdown 或纯文本文件
                    </FieldLabel>
                    <Input
                      id="material-file"
                      name="file"
                      type="file"
                      accept=".md,.txt,text/markdown,text/plain"
                      required
                    />
                    <FieldDescription>
                      仅支持 UTF-8；单文件不超过 1 MiB，正文不超过 50000 字。
                    </FieldDescription>
                  </Field>
                  <Button
                    variant="outline"
                    className="justify-self-start"
                    type="submit"
                    disabled={pending}
                  >
                    {pending ? "导入中…" : "导入文件"}
                  </Button>
                </FieldGroup>
              </form>
              <Separator className="my-7" />
              <form onSubmit={(event) => void saveLink(event)}>
                <FieldGroup>
                  <h3 className="text-lg font-medium">保存网页链接</h3>
                  <Field>
                    <FieldLabel htmlFor="material-url">公开网页 URL</FieldLabel>
                    <Input
                      id="material-url"
                      name="url"
                      type="url"
                      placeholder="https://example.com/article"
                      maxLength={2048}
                      required
                    />
                    <FieldDescription>
                      仅支持 HTTP/HTTPS 公网地址。抓取失败时仍会保存链接。
                    </FieldDescription>
                  </Field>
                  {remoteFetchEnabled ? (
                    <Field orientation="horizontal">
                      <Switch
                        id="material-fetch"
                        checked={fetchRequested}
                        onCheckedChange={setFetchRequested}
                      />
                      <FieldLabel htmlFor="material-fetch">
                        尝试抓取公开网页文字
                      </FieldLabel>
                    </Field>
                  ) : (
                    <FieldDescription>
                      此环境未开启远程抓取；保存后可粘贴正文。
                    </FieldDescription>
                  )}
                  <Button
                    variant="outline"
                    className="justify-self-start"
                    type="submit"
                    disabled={pending}
                  >
                    {pending ? "保存中…" : "保存链接"}
                  </Button>
                </FieldGroup>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
