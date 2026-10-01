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
    <div className="flex items-center gap-2">
      <button
        className="cursor-pointer text-sm font-bold text-[#174a42] hover:underline focus-visible:underline disabled:cursor-wait"
        type="button"
        onClick={signOut}
        disabled={pending}
      >
        {pending ? "退出中…" : "退出登录"}
      </button>
      {error && (
        <span className="text-xs text-[#9d372a]" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
