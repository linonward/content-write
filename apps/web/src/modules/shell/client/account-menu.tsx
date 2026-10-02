"use client";

import { Menu } from "@base-ui/react/menu";
import {
  Check,
  ChevronsUpDown,
  LogOut,
  Monitor,
  Moon,
  Settings,
  Sun,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  clearLocalCopies,
  hasLocalCopies,
} from "@/modules/articles/client/local-copy";
import { authClient } from "@/modules/identity/client/auth-client";
import { setTheme, useTheme } from "@/modules/theme/client/theme-store";
import { parseTheme } from "@/modules/theme/theme";
import { hasUnsavedChanges } from "./unsaved-changes";

const themeOptions = [
  { value: "system", label: "跟随系统", Icon: Monitor },
  { value: "light", label: "浅色", Icon: Sun },
  { value: "dark", label: "深色", Icon: Moon },
] as const;

export type ShellUser = { name: string; email: string; role: string };
const itemClass =
  "flex h-8 cursor-default items-center gap-2 rounded-xs px-2 text-label text-ink-2 no-underline outline-none data-highlighted:bg-sunken data-highlighted:text-ink";

function Avatar({ user }: { user: ShellUser }) {
  return (
    <span
      aria-hidden
      className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-accent-soft text-label text-accent"
    >
      {Array.from(user.name)[0] ?? "作"}
    </span>
  );
}
function UserInfo({ user }: { user: ShellUser }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
      <span className="truncate text-label text-ink">{user.name}</span>
      <span className="truncate text-meta text-ink-2" title={user.email}>
        {user.email}
      </span>
    </span>
  );
}

export function AccountMenu({
  user,
  mobile = false,
}: {
  user: ShellUser;
  mobile?: boolean;
}) {
  const router = useRouter();
  const trigger = useRef<HTMLButtonElement>(null);
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const theme = useTheme();

  async function signOut() {
    setPending(true);
    setError("");
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error("退出失败");
      clearLocalCopies(window.localStorage);
      router.replace("/sign-in");
      router.refresh();
    } catch {
      setError("退出失败，请重试。");
    } finally {
      setPending(false);
    }
  }
  function requestLogout() {
    if (hasUnsavedChanges() || hasLocalCopies(window.localStorage))
      setConfirm(true);
    else void signOut();
  }
  return (
    <>
      <Menu.Root>
        <Menu.Trigger
          ref={trigger}
          aria-label="账号菜单"
          disabled={pending}
          className={cn(
            "shell-account flex w-full items-center gap-2 rounded-sm p-2 hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent data-popup-open:bg-sunken",
            mobile && "shell-account-mobile",
          )}
        >
          <Avatar user={user} />
          {!mobile && (
            <>
              <span className="shell-label flex min-w-0 flex-1">
                <UserInfo user={user} />
              </span>
              <ChevronsUpDown
                aria-hidden
                className="shell-label size-4 shrink-0 text-ink-2"
              />
            </>
          )}
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner
            side={mobile ? "bottom" : "right"}
            align="end"
            sideOffset={mobile ? 4 : 12}
            className="z-40 outline-none"
          >
            <Menu.Popup className="w-60 rounded-sm border border-line bg-surface text-ink shadow-float outline-none">
              <div className="flex items-center gap-2 px-3 py-2">
                <Avatar user={user} />
                <UserInfo user={user} />
              </div>
              <Menu.Separator className="h-px bg-line" />
              <div className="p-1">
                <Menu.Item
                  render={<Link href="/settings/profile" />}
                  className={itemClass}
                >
                  <Settings aria-hidden className="size-4" />
                  作者设置
                </Menu.Item>
                {user.role === "admin" && (
                  <Menu.Item
                    render={<Link href="/admin/users" />}
                    className={itemClass}
                  >
                    <Users aria-hidden className="size-4" />
                    账号管理
                    <span className="flex flex-1 justify-end text-meta text-ink-2">
                      管理员
                    </span>
                  </Menu.Item>
                )}
              </div>
              <Menu.Separator className="h-px bg-line" />
              <Menu.RadioGroup
                value={theme}
                onValueChange={(value: string) => setTheme(parseTheme(value))}
                className="p-1"
              >
                <Menu.GroupLabel className="px-2 py-1 text-meta text-ink-2">
                  外观
                </Menu.GroupLabel>
                {themeOptions.map(({ value, label, Icon }) => (
                  <Menu.RadioItem
                    key={value}
                    value={value}
                    closeOnClick={false}
                    className={cn(itemClass, "data-checked:text-ink")}
                  >
                    <Icon aria-hidden className="size-4" />
                    {label}
                    <Menu.RadioItemIndicator className="ml-auto flex text-accent">
                      <Check aria-hidden className="size-4" />
                    </Menu.RadioItemIndicator>
                  </Menu.RadioItem>
                ))}
              </Menu.RadioGroup>
              <Menu.Separator className="h-px bg-line" />
              <div className="p-1">
                <Menu.Item className={itemClass} onClick={requestLogout}>
                  <LogOut aria-hidden className="size-4" />
                  退出登录
                </Menu.Item>
              </div>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      {error && (
        <p role="alert" className="text-meta text-danger">
          {error}
        </p>
      )}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent finalFocus={trigger}>
          <AlertDialogHeader>
            <AlertDialogTitle>退出前确认</AlertDialogTitle>
            <AlertDialogDescription>
              未保存的修改与本机未同步的文章恢复副本会被清除。请先保存需要保留的内容。
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <p role="alert" className="text-meta text-danger">
              {error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>继续编辑</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={() => void signOut()}
            >
              {pending ? "退出中…" : "确认退出"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
