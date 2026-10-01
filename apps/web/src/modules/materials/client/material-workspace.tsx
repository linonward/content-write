"use client";

import { useCallback, useEffect, useState } from "react";

type Material = {
  id: string;
  title: string;
  content: string;
  kind: "text";
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
      ...(init?.body ? { "content-type": "application/json" } : {}),
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
    <section className="material-workspace" aria-label="文字素材">
      <aside className="material-list">
        <div className="material-list-head">
          <h2>最近素材</h2>
          <button type="button" onClick={startCreate}>
            + 新建
          </button>
        </div>
        {loading ? (
          <p className="form-note">加载中…</p>
        ) : items.length === 0 ? (
          <p className="form-note">还没有素材。写下第一条想法吧。</p>
        ) : (
          <ul>
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={selected?.id === item.id ? "selected" : ""}
                  onClick={() => void open(item.id)}
                >
                  <strong>{item.title}</strong>
                  <span>
                    版本 {item.currentVersion} ·{" "}
                    {new Date(item.updatedAt).toLocaleDateString("zh-CN")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {items.length === 100 && (
          <p className="form-note">当前显示最近 100 条素材。</p>
        )}
      </aside>
      <div className="material-detail">
        <div className="material-detail-head">
          <h2>
            {mode === "create"
              ? "添加文字素材"
              : mode === "edit"
                ? "编辑素材"
                : selected?.title}
          </h2>
          {selected && (
            <span className="status-muted">版本 {selected.currentVersion}</span>
          )}
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="form-success" role="status">
            {notice}
          </p>
        )}
        {mode === "view" && selected ? (
          <>
            <p className="material-meta">
              更新于 {new Date(selected.updatedAt).toLocaleString("zh-CN")}
            </p>
            <div className="material-body">{selected.content}</div>
            <div className="material-actions">
              <button
                className="primary-button"
                type="button"
                onClick={() => {
                  setMode("edit");
                  setNotice("");
                }}
              >
                编辑
              </button>
              <button
                className="danger-button"
                type="button"
                disabled={pending}
                onClick={() => void remove()}
              >
                删除
              </button>
            </div>
          </>
        ) : (
          <form className="auth-form" onSubmit={(event) => void save(event)}>
            <label htmlFor="material-title">标题</label>
            <input
              id="material-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
              required
            />
            <label htmlFor="material-content">正文</label>
            <textarea
              id="material-content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              maxLength={50_000}
              rows={14}
              required
            />
            <p className="form-note">
              {content.length} / 50000 字。当前仅保存文字，不会自动调用模型。
            </p>
            <div className="material-actions">
              <button
                className="primary-button"
                type="submit"
                disabled={pending}
              >
                {pending ? "保存中…" : "保存素材"}
              </button>
              {mode === "edit" && (
                <button
                  type="button"
                  className="outline-link"
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
      </div>
    </section>
  );
}
