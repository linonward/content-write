"use client";

import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/modules/identity/client/auth-client";
import { useUnsavedChanges } from "@/modules/shell/client/unsaved-changes";

export function InviteUserForm() {
  const [dirty, setDirty] = useState(false);
  useUnsavedChanges(dirty);
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
      setDirty(false);
    } catch {
      setError("创建暂时不可用，请稍后重试。");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      onChange={(event) => {
        const data = new FormData(event.currentTarget);
        setDirty([...data.values()].some((value) => String(value).length > 0));
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="invite-name">姓名</FieldLabel>
          <Input
            id="invite-name"
            name="name"
            type="text"
            autoComplete="off"
            maxLength={80}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="invite-email">邮箱</FieldLabel>
          <Input
            id="invite-email"
            name="email"
            type="email"
            autoComplete="off"
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="invite-password">初始密码</FieldLabel>
          <Input
            id="invite-password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
          />
        </Field>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {createdEmail && (
          <Alert role="status">
            <AlertDescription>
              已创建 {createdEmail}。请通过可信渠道发送登录信息。
            </AlertDescription>
          </Alert>
        )}
        <Button size="lg" className="w-full" type="submit" disabled={pending}>
          {pending ? "创建中…" : "创建账号"}
        </Button>
        <FieldDescription>
          当前不发送邀请邮件或重置密码邮件。密码只在本次输入时显示，请妥善传达。
        </FieldDescription>
      </FieldGroup>
    </form>
  );
}
