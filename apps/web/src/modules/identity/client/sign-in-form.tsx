"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ui } from "@/lib/styles";
import { authClient } from "@/modules/identity/client/auth-client";

export function SignInForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await authClient.signIn.email({
        email: String(form.get("email") ?? "").trim(),
        password: String(form.get("password") ?? ""),
      });
      if (result.error) {
        setError(
          result.error.status === 429
            ? "尝试次数过多，请稍后再试。"
            : "邮箱或密码不正确。请重试。",
        );
        return;
      }
      router.replace("/home");
      router.refresh();
    } catch {
      setError("登录暂时不可用，请稍后重试。");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className={ui.form} onSubmit={submit}>
      <label className={ui.label} htmlFor="email">
        邮箱
      </label>
      <input
        id="email"
        className={ui.input}
        name="email"
        type="email"
        autoComplete="username"
        required
      />
      <label className={ui.label} htmlFor="password">
        密码
      </label>
      <input
        id="password"
        className={ui.input}
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      {error && (
        <p className={ui.error} role="alert">
          {error}
        </p>
      )}
      <button
        className={`${ui.primaryButton} mt-[18px]`}
        type="submit"
        disabled={pending}
      >
        {pending ? "登录中…" : "登录"}
      </button>
      <p className={ui.note}>仅限受邀账号。忘记密码请联系管理员。</p>
    </form>
  );
}
