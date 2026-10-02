"use client";

import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type Settings = { consentRequired: boolean; provider: string | null };

/**
 * Before the first real-model call the author must accept that materials are
 * sent to the configured provider (product 9.3). The API enforces the same rule.
 */
export function AiConsentNotice() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch(`${apiBase}/api/ai/settings`, { credentials: "include" })
      .then((response) => (response.ok ? response.json() : null))
      .then((value: Settings | null) => setSettings(value))
      .catch(() => setSettings(null));
  }, []);

  if (!settings?.consentRequired) return null;

  async function accept() {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`${apiBase}/api/ai/consent`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error();
      setSettings((await response.json()) as Settings);
    } catch {
      setError("确认失败，请稍后重试。");
    } finally {
      setPending(false);
    }
  }

  return (
    <Alert role="status">
      <AlertDescription className="space-y-3">
        <p>
          首次使用真实模型：生成时，相关素材、作者设置和文章内容会发送给
          DeepSeek 模型服务处理。生成结果只是建议，事实仍需你核对。
        </p>
        {error && <p className="text-danger">{error}</p>}
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() => void accept()}
        >
          {pending ? "确认中…" : "我已了解，继续使用"}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
