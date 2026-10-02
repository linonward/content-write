import { randomUUID } from "node:crypto";
import { rateLimit, user } from "@content-write/db/auth-schema";
import { getDb } from "@content-write/db/client";
import { articles } from "@content-write/db/schema";
import { expect, type Page, test } from "@playwright/test";
import { eq } from "drizzle-orm";

async function login(page: Page) {
  await getDb().delete(rateLimit);
  await page.goto("/sign-in");
  await page.getByLabel("邮箱").fill(process.env.E2E_EMAIL ?? "");
  await page.getByLabel("密码").fill(process.env.E2E_PASSWORD ?? "");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/home$/);
}
const account = (page: Page) =>
  page.getByRole("button", { name: "账号菜单" }).filter({ visible: true });

// All screenshots/reports live outside the checkout.
test("persists sidebar choice, supports shortcut and preserves editor focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const sidebar = page.getByRole("complementary", { name: "侧栏" });
  const toggle = page.getByRole("button", { name: "折叠侧栏" });
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(sidebar).toHaveCSS("width", "232px");
  await toggle.click();
  await expect(page.getByRole("button", { name: "展开侧栏" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(sidebar).toHaveCSS("width", "56px");
  await page.reload();
  await expect(page.getByRole("button", { name: "展开侧栏" })).toBeVisible();
  await page
    .getByRole("navigation", { name: "主导航" })
    .getByRole("link", { name: "素材箱" })
    .click();
  await expect(
    page.getByRole("heading", { name: "素材箱", exact: true }),
  ).toBeVisible();
  const input = page.getByLabel("标题", { exact: true });
  await input.focus();
  await page.keyboard.press("Control+Backslash");
  await expect(input).toBeFocused();
  await expect(page.getByRole("button", { name: "折叠侧栏" })).toBeVisible();
  await page.keyboard.press("Meta+Backslash");
  await expect(input).toBeFocused();
  await expect(sidebar).toHaveCSS("width", "56px");
  await page
    .getByRole("navigation", { name: "主导航" })
    .getByRole("link", { name: "选题" })
    .focus();
  await expect(
    page.locator(".shell-tooltip").filter({ hasText: "选题" }),
  ).toBeVisible();
});

test("account menu handles arrows, Escape, profile and sign-out", async ({
  page,
}) => {
  await login(page);
  const trigger = account(page);
  await trigger.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu", { name: "账号菜单", exact: true });
  await expect(menu).toBeVisible();
  await expect(menu.getByText("E2E 作者")).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /账号管理/ })).toHaveCount(0);
  await expect(menu.getByRole("menuitem", { name: "作者设置" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: "退出登录" })).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(menu.getByRole("menuitem", { name: "作者设置" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByRole("menuitem", { name: "作者设置" }).click();
  await expect(page).toHaveURL(/\/settings\/profile$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("作者设置");
  await account(page).click();
  await page.getByRole("menuitem", { name: "退出登录" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("warns for unsaved form and clears recovery copies only after confirmed sign-out", async ({
  page,
}) => {
  await login(page);
  await page.goto("/settings/profile");
  await page.getByLabel("作者简介").fill(`未保存 ${randomUUID()}`);
  await account(page).click();
  await page.getByRole("menuitem", { name: "退出登录" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("未保存的修改");
  await page.getByRole("button", { name: "继续编辑" }).click();
  await expect(account(page)).toBeFocused();
  await expect(page).toHaveURL(/\/settings\/profile$/);
  // Moving away unregisters the form; a copy from another article still needs confirmation.
  await page.goto("/home");
  await page.evaluate(() =>
    localStorage.setItem(
      "content-write:article:recovery",
      JSON.stringify({
        baseVersion: 1,
        title: "本机副本",
        body: "未同步",
        savedAt: new Date().toISOString(),
      }),
    ),
  );
  await account(page).click();
  await page.getByRole("menuitem", { name: "退出登录" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "确认退出" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("content-write:article:recovery"),
    ),
  ).toBeNull();
});

test("article workspace collapses temporarily and restores the navigation preference", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const [author] = await getDb()
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, process.env.E2E_EMAIL ?? ""));
  const id = randomUUID();
  await getDb().insert(articles).values({
    id,
    userId: author.id,
    workingTitle: "外壳验证",
    audience: "作者",
    thesis: "保留用户选择",
    sourceCount: 0,
  });
  await page.goto(`/articles/${id}`);
  await expect(page.getByRole("button", { name: "展开侧栏" })).toBeVisible();
  await page.getByRole("button", { name: "展开侧栏" }).click();
  await page.getByRole("link", { name: "文章列表", exact: true }).click();
  await expect(page.getByRole("button", { name: "折叠侧栏" })).toBeVisible();
  await page.getByRole("button", { name: "折叠侧栏" }).click();
  await page.goto(`/articles/${id}`);
  await page.getByRole("button", { name: "展开侧栏" }).click();
  await page.getByRole("link", { name: "文章列表", exact: true }).click();
  await expect(page.getByRole("button", { name: "展开侧栏" })).toBeVisible();
});

test("375px bottom navigation works without horizontal scrolling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page);
  const bottom = page.getByRole("navigation", { name: "底部导航" });
  await expect(bottom).toBeVisible();
  await expect(page.getByRole("complementary", { name: "侧栏" })).toBeHidden();
  for (const [label, path] of [
    ["拆解", "breakdowns"],
    ["素材箱", "inbox"],
    ["选题", "ideas"],
    ["文章", "articles"],
    ["首页", "home"],
  ]) {
    await bottom.getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${path}$`));
    await expect(
      bottom.getByRole("link", { name: label, exact: true }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(375);
  }
  await expect(page.locator("header")).toHaveCSS("height", "56px");
  await expect(bottom).toHaveCSS("height", "64px");
  await account(page).click();
  await expect(
    page.getByRole("menu", { name: "账号菜单", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("tablet expansion overlays content and reduced motion removes transitions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await login(page);
  const sidebar = page.getByRole("complementary", { name: "侧栏" });
  await expect(sidebar).toHaveCSS("width", "56px");
  const contentBefore = await page.locator("main").boundingBox();
  await page.getByRole("button", { name: "展开侧栏" }).click();
  await expect(sidebar).toHaveCSS("width", "232px");
  expect((await page.locator("main").boundingBox())?.x).toBe(contentBefore?.x);
  await expect(sidebar).toHaveCSS("transition-duration", "0s");
  await page.getByRole("button", { name: "折叠侧栏" }).click();
  await expect(sidebar).toHaveCSS("width", "56px");
});

test("administrator sees account management and can open it", async ({
  page,
}) => {
  const email = process.env.E2E_EMAIL ?? "";
  await getDb()
    .update(user)
    .set({ role: "admin" })
    .where(eq(user.email, email));
  try {
    await login(page);
    await account(page).click();
    await page.getByRole("menuitem", { name: /账号管理/ }).click();
    await expect(page).toHaveURL(/\/admin\/users$/);
    await expect(page.getByRole("heading", { name: "账号管理" })).toBeVisible();
    await expect(page.getByLabel("邮箱")).toBeVisible();
  } finally {
    await getDb()
      .update(user)
      .set({ role: "user" })
      .where(eq(user.email, email));
  }
});
