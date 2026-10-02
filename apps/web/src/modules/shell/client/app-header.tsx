"use client";

import {
  BookOpenText,
  FileText,
  House,
  Inbox,
  Lightbulb,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ui } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { LogoutButton } from "@/modules/identity/client/logout-button";

// Order from product 3: 首页、拆解、素材箱、选题、文章.
const items: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/home", label: "首页", icon: House },
  { href: "/breakdowns", label: "拆解", icon: BookOpenText },
  { href: "/inbox", label: "素材箱", icon: Inbox },
  { href: "/ideas", label: "选题", icon: Lightbulb },
  { href: "/articles", label: "文章", icon: FileText },
];

export function AppHeader() {
  const pathname = usePathname();
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <Link className={cn(ui.header, ui.brand)} href="/home">
        <span className={ui.mark}>拆</span>
        <span>拆写</span>
      </Link>
      <nav
        aria-label="主导航"
        className="flex flex-1 gap-1 overflow-x-auto max-md:order-last max-md:basis-full"
      >
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-sm px-3 py-1.5 text-label text-ink-2 no-underline hover:bg-sunken",
                active && "bg-accent-soft text-accent",
              )}
            >
              <Icon aria-hidden className="size-4" />
              {label}
            </Link>
          );
        })}
      </nav>
      <LogoutButton />
    </header>
  );
}
