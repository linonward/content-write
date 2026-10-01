"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
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
      router.replace("/sign-in");
      router.refresh();
    } catch {
      setError("退出失败，请重试。");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="logout-control">
      <button type="button" onClick={signOut} disabled={pending}>
        {pending ? "退出中…" : "退出登录"}
      </button>
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
