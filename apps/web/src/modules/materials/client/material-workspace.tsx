"use client";

import { useCallback, useEffect, useState } from "react";
import { ui } from "@/lib/styles";

type Material = {
  id: string;
  title: string;
  content: string;
  kind: "text" | "markdown";
  sourceFilename: string | null;
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

  async function remove() {
    if (
      !selected ||
      !window.confirm(
        `删除「${selected.title}」及其全部历史版本？此操作不可恢复。`,
      )
    )
      return;
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
      <aside className={ui.panel}>
        <div className={ui.panelHead}>
          <h2 className="text-xl">最近素材</h2>
          <button
            className="cursor-pointer font-bold text-[#174a42]"
            type="button"
            onClick={startCreate}
          >
            + 新建
          </button>
        </div>
        {loading ? (
          <p className={ui.note}>加载中…</p>
        ) : items.length === 0 ? (
          <p className={ui.note}>还没有素材。写下第一条想法吧。</p>
        ) : (
          <ul className="mt-6">
            {items.map((item) => (
              <li
                className="border-b border-[#e2e7e2] last:border-b-0"
                key={item.id}
              >
                <button
                  type="button"
                  className={`${ui.listButton} ${selected?.id === item.id ? "bg-[#eaf1eb]" : ""}`}
                  onClick={() => void open(item.id)}
                >
                  <strong className="truncate">{item.title}</strong>
                  <span className="text-[13px] text-[#66716c]">
                    {item.sourceFilename ? "文件导入" : "文字"} · 版本{" "}
                    {item.currentVersion} ·{" "}
                    {new Date(item.updatedAt).toLocaleDateString("zh-CN")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {items.length === 100 && (
          <p className={ui.note}>当前显示最近 100 条素材。</p>
        )}
      </aside>
      <div className={ui.panel}>
        <div className={ui.panelHead}>
          <h2 className="text-xl">
            {mode === "create"
              ? "添加文字素材"
              : mode === "edit"
                ? "编辑素材"
                : selected?.title}
          </h2>
          {selected && (
            <span className={ui.muted}>版本 {selected.currentVersion}</span>
          )}
        </div>
        {error && (
          <p className={ui.error} role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className={ui.success} role="status">
            {notice}
          </p>
        )}
        {mode === "view" && selected ? (
          <>
            <p className="text-[13px] text-[#66716c]">
              更新于 {new Date(selected.updatedAt).toLocaleString("zh-CN")}
            </p>
            {selected.sourceFilename && (
              <p className="text-[13px] text-[#66716c]">
                来源文件：{selected.sourceFilename} ·{" "}
                {selected.kind === "markdown" ? "Markdown" : "纯文本"}
              </p>
            )}
            <div className="mt-7 whitespace-pre-wrap wrap-anywhere leading-[1.8]">
              {selected.content}
            </div>
            <div className="mt-[22px] flex items-center gap-3">
              <button
                className={ui.primaryButton}
                type="button"
                onClick={() => {
                  setMode("edit");
                  setNotice("");
                }}
              >
                编辑
              </button>
              <button
                className="cursor-pointer rounded-lg border border-[#bd6a5b] bg-white px-[18px] py-3 text-[#8c2f23] disabled:cursor-wait disabled:opacity-65"
                type="button"
                disabled={pending}
                onClick={() => void remove()}
              >
                删除
              </button>
            </div>
          </>
        ) : (
          <form className={ui.form} onSubmit={(event) => void save(event)}>
            <label className={ui.label} htmlFor="material-title">
              标题
            </label>
            <input
              id="material-title"
              className={ui.input}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
              required
            />
            <label className={ui.label} htmlFor="material-content">
              正文
            </label>
            <textarea
              id="material-content"
              className={ui.textarea}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              maxLength={50_000}
              rows={14}
              required
            />
            <p className={ui.note}>
              {content.length} / 50000 字。当前仅保存文字，不会自动调用模型。
            </p>
            <div className="mt-[22px] flex items-center gap-3">
              <button
                className={ui.primaryButton}
                type="submit"
                disabled={pending}
              >
                {pending ? "保存中…" : "保存素材"}
              </button>
              {mode === "edit" && (
                <button
                  type="button"
                  className={ui.outlineLink}
                  onClick={() => {
                    setMode("view");
                    setError("");
                  }}
                >
                  取消
                </button>
              )}
            </div>
          </form>
        )}
        {mode === "create" && (
          <form
            className="mt-8 grid gap-3 border-t border-[#e2e7e2] pt-6"
            onSubmit={(event) => void upload(event)}
          >
            <h3 className="text-lg">从文件导入</h3>
            <label className="text-sm font-bold" htmlFor="material-file">
              选择 Markdown 或纯文本文件
            </label>
            <input
              id="material-file"
              className="w-full"
              name="file"
              type="file"
              accept=".md,.txt,text/markdown,text/plain"
              required
            />
            <p className={ui.note}>
              仅支持 UTF-8；单文件不超过 1 MiB，正文不超过 50000 字。
            </p>
            <button
              className={`${ui.outlineLink} justify-self-start bg-white cursor-pointer disabled:cursor-wait disabled:opacity-65`}
              type="submit"
              disabled={pending}
            >
              {pending ? "导入中…" : "导入文件"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
