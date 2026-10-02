"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { clearLocalCopies } from "@/modules/articles/client/local-copy";
import { authClient } from "@/modules/identity/client/auth-client";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function signOut() {
    setPending(true);
    setError("");
    try {
      const result = await authClient.signOut();
      if (result.error) {
        setError("退出失败，请重试。");
        return;
      }
      // Unsaved article text must not outlive the session on a shared browser.
      clearLocalCopies(window.localStorage);
      router.replace("/sign-in");
      router.refresh();
    } catch {
      setError("退出失败，请重试。");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        type="button"
        onClick={signOut}
        disabled={pending}
      >
        {pending ? "退出中…" : "退出登录"}
      </Button>
      {error && (
        <span className="text-xs text-danger" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
