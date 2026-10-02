"use client";

import {
  BookOpenText,
  FileText,
  House,
  Inbox,
  Lightbulb,
  PanelLeft,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import { AccountMenu, type ShellUser } from "./account-menu";

const STORAGE_KEY = "content-write:sidebar-expanded";
const navigation = [
  { href: "/home", label: "首页", icon: House },
  { href: "/breakdowns", label: "拆解", icon: BookOpenText },
  { href: "/inbox", label: "素材箱", icon: Inbox },
  { href: "/ideas", label: "选题", icon: Lightbulb },
  { href: "/articles", label: "文章", icon: FileText },
];
const ShellContext = createContext<{
  expanded: boolean;
  toggle: () => void;
  user: ShellUser;
} | null>(null);

export function AppShell({
  user,
  children,
}: {
  user: ShellUser;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const workspace = /^\/articles\/[^/]+$/.test(pathname);
  const [preference, setPreference] = useState<boolean | null>(null);
  const [wide, setWide] = useState(false);
  const [workspaceChoice, setWorkspaceChoice] = useState<{
    path: string;
    expanded: boolean;
  } | null>(null);
  const expanded = workspace
    ? workspaceChoice?.path === pathname && workspaceChoice.expanded
    : (preference ?? wide);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1280px)");
    const sync = () => setWide(media.matches);
    sync();
    media.addEventListener("change", sync);
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "true" || stored === "false")
        setPreference(stored === "true");
    } catch {
      /* Storage-disabled browsers retain the in-memory choice. */
    }
    return () => media.removeEventListener("change", sync);
  }, []);
  useEffect(() => {
    if (!workspace) setWorkspaceChoice(null);
  }, [workspace]);

  const toggle = useCallback(() => {
    if (workspace) {
      setWorkspaceChoice({ path: pathname, expanded: !expanded });
    } else {
      setPreference(!expanded);
      try {
        window.localStorage.setItem(STORAGE_KEY, String(!expanded));
      } catch {
        /* Optional persistence. */
      }
    }
  }, [expanded, pathname, workspace]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key === "\\" &&
        !event.altKey &&
        !event.repeat
      ) {
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [toggle]);

  return (
    <ShellContext value={{ expanded, toggle, user }}>
      <div className="app-shell" data-expanded={expanded}>
        <a
          href="#page-content"
          className="shell-skip rounded-sm bg-surface px-4 py-2 text-accent"
        >
          跳到正文
        </a>
        <aside
          id="app-sidebar"
          aria-label="侧栏"
          className="app-sidebar flex flex-col border-r border-line bg-sidebar"
        >
          <Link
            href="/home"
            aria-label="拆写首页"
            className="shell-brand flex h-16 items-center gap-3 px-4 no-underline"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-accent font-serif text-title-section text-ink-inverse">
              拆
            </span>
            <span className="shell-label font-serif text-title-page">拆写</span>
          </Link>
          <nav aria-label="主导航" className="flex flex-1 flex-col gap-1 p-2">
            {navigation.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                aria-label={label}
                aria-current={
                  pathname === href || pathname.startsWith(`${href}/`)
                    ? "page"
                    : undefined
                }
                className="shell-nav group relative flex h-9 items-center gap-3 rounded-sm px-3 text-label text-ink-2 no-underline hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <Icon aria-hidden className="size-4.5 shrink-0" />
                <span className="shell-label">{label}</span>
                <span className="shell-tooltip" aria-hidden>
                  {label}
                </span>
              </Link>
            ))}
          </nav>
          <div className="border-t border-line p-2">
            <AccountMenu user={user} />
          </div>
        </aside>
        <div className="app-main min-w-0">{children}</div>
        <nav
          aria-label="底部导航"
          className="shell-bottom border-t border-line bg-surface"
        >
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={
                pathname === href || pathname.startsWith(`${href}/`)
                  ? "page"
                  : undefined
              }
              className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 text-meta text-ink-2 no-underline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <Icon aria-hidden className="size-5" />
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </ShellContext>
  );
}

/** Pages declare their topbar and actions here; the shared layout owns navigation. */
export function AppPage({
  title,
  description,
  actions,
  children,
  narrow = false,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  narrow?: boolean;
}) {
  const shell = useContext(ShellContext);
  if (!shell) throw new Error("AppPage requires AppShell");
  return (
    <>
      <header className="shell-topbar sticky top-0 z-20 flex h-16 min-w-0 items-center gap-2 border-b border-line bg-canvas px-4">
        <button
          type="button"
          onClick={shell.toggle}
          aria-label={shell.expanded ? "折叠侧栏" : "展开侧栏"}
          aria-expanded={shell.expanded}
          aria-controls="app-sidebar"
          title="切换侧栏（⌘\\ / Ctrl+\\）"
          className="shell-toggle flex size-7 shrink-0 items-center justify-center rounded-sm text-ink hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <PanelLeft aria-hidden className="size-4" />
        </button>
        <span className="shell-divider h-4 w-px shrink-0 bg-line" aria-hidden />
        <h1 className="min-w-0 truncate font-serif text-title-page">{title}</h1>
        {description && (
          <p className="hidden min-w-0 truncate text-label font-normal text-ink-2 xl:block">
            {description}
          </p>
        )}
        <div className="flex min-w-0 flex-1 justify-end gap-2">{actions}</div>
        <div className="md:hidden">
          <AccountMenu user={shell.user} mobile />
        </div>
      </header>
      <main
        id="page-content"
        tabIndex={-1}
        className={cn(
          "shell-content flex flex-col gap-6 px-8 py-8 outline-none max-md:px-4 max-md:py-6",
          narrow ? "max-w-form" : "max-w-workspace",
        )}
      >
        {children}
      </main>
    </>
  );
}
