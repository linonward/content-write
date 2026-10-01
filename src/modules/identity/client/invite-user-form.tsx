"use client";

import { useState } from "react";
import { authClient } from "@/modules/identity/client/auth-client";

export function InviteUserForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [createdEmail, setCreatedEmail] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setCreatedEmail("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "")
      .trim()
      .toLowerCase();
    const password = String(form.get("password") ?? "");
    if (password.length < 12) {
      setError("初始密码至少需要 12 个字符。");
      setPending(false);
      return;
    }
    try {
      const result = await authClient.admin.createUser({
        name,
        email,
        password,
        role: "user",
      });
      if (result.error) {
        setError(
          result.error.status === 409
            ? "这个邮箱已有账号。"
            : "创建失败，请检查信息后重试。",
        );
        return;
      }
      setCreatedEmail(email);
      formElement.reset();
    } catch {
      setError("创建暂时不可用，请稍后重试。");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <label htmlFor="invite-name">姓名</label>
      <input
        id="invite-name"
        name="name"
        type="text"
        autoComplete="off"
        maxLength={80}
        required
      />
      <label htmlFor="invite-email">邮箱</label>
      <input
        id="invite-email"
        name="email"
        type="email"
        autoComplete="off"
        required
      />
      <label htmlFor="invite-password">初始密码</label>
      <input
        id="invite-password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={12}
        maxLength={128}
        required
      />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {createdEmail && (
        <p className="form-success" role="status">
          已创建 {createdEmail}。请通过可信渠道发送登录信息。
        </p>
      )}
      <button className="primary-button" type="submit" disabled={pending}>
        {pending ? "创建中…" : "创建账号"}
      </button>
      <p className="form-note">
        当前不发送邀请邮件或重置密码邮件。密码只在本次输入时显示，请妥善传达。
      </p>
    </form>
  );
}
