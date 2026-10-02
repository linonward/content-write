import { rateLimit } from "@content-write/db/auth-schema";
import { getDb } from "@content-write/db/client";
import { expect, test } from "@playwright/test";

// T032 replaced the native file input and selects with the design-system dropzone and Select.
test("imports a Markdown file through the dropzone and filters by type", async ({
  page,
}) => {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password)
    throw new Error("global setup did not create a user");
  await getDb().delete(rateLimit);
  await page.goto("/sign-in");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goto("/inbox");

  await page.getByRole("button", { name: "添加素材", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "添加素材" });
  await dialog.getByRole("button", { name: "文件", exact: true }).click();
  // Imported materials are titled after the file name.
  const title = `导入素材-${Date.now()}`;
  await page.getByLabel("选择 Markdown 或纯文本文件").setInputFiles({
    name: `${title}.md`,
    mimeType: "text/markdown",
    buffer: Buffer.from("先把零散的想法记下来。"),
  });
  await expect(page.getByText(`${title}.md`)).toBeVisible();
  await page.getByRole("button", { name: "导入文件" }).click();
  await expect(dialog).not.toBeVisible();
  const back = page.getByRole("button", { name: "返回素材列表" });
  if (await back.isVisible()) await back.click();
  const item = page.getByRole("listitem").filter({ hasText: title });
  await expect(item).toBeVisible();
  await expect(item.getByText("未整理")).toBeVisible();

  const kind = page.getByRole("combobox", { name: "素材类型" });
  await kind.click();
  await page.getByRole("option", { name: "链接" }).click();
  await expect(kind).toHaveText("链接");
  await page.getByRole("button", { name: "查找" }).click();
  await expect(
    page.getByRole("listitem").filter({ hasText: title }),
  ).toHaveCount(0);

  await kind.click();
  await page.getByRole("option", { name: "Markdown" }).click();
  await page.getByRole("button", { name: "查找" }).click();
  await expect(item).toBeVisible();
});

test("adds text and a manual link through the source dialog, then searches", async ({
  page,
}) => {
  await getDb().delete(rateLimit);
  await page.goto("/sign-in");
  await page.getByLabel("邮箱").fill(process.env.E2E_EMAIL ?? "");
  await page.getByLabel("密码").fill(process.env.E2E_PASSWORD ?? "");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.getByRole("link", { name: "添加素材", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "添加素材" });
  const title = `对话框素材-${Date.now()}`;
  const linkHost = `t035-${Date.now()}.example.com`;
  await dialog.getByLabel("标题", { exact: true }).fill(title);
  await dialog
    .getByLabel("正文", { exact: true })
    .fill("先保存自己的观点，再整理来源。");
  await dialog.getByRole("button", { name: "链接", exact: true }).click();
  await expect(dialog.getByLabel("公开网页 URL")).toBeVisible();
  await dialog.getByRole("button", { name: "文字", exact: true }).click();
  await expect(dialog.getByLabel("标题", { exact: true })).toHaveValue(title);
  await dialog.getByRole("button", { name: "保存素材" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await page
    .getByLabel("正文", { exact: true })
    .fill("自己的观点已经补上一个真实经历。");
  await page.getByRole("button", { name: "保存素材" }).click();
  await expect(page.getByText("版本 2", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "添加素材", exact: true }).click();
  await dialog.getByRole("button", { name: "链接", exact: true }).click();
  await dialog.getByLabel("公开网页 URL").fill(`https://${linkHost}/source`);
  await dialog.getByRole("button", { name: "保存链接", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  // Without fetched text the paste editor opens right away.
  const paste = page.getByLabel("粘贴正文", { exact: true });
  await expect(paste).toBeFocused();
  await paste.fill("从原文复制来的正文。");
  await page.getByRole("button", { name: "保存素材" }).click();
  await expect(page.getByText("版本 2", { exact: true })).toBeVisible();
  const back = page.getByRole("button", { name: "返回素材列表" });
  if (await back.isVisible()) await back.click();
  await page.getByLabel("搜索素材").fill(title);
  await page.getByRole("button", { name: "查找", exact: true }).click();
  await expect(
    page.getByRole("listitem").filter({ hasText: title }),
  ).toBeVisible();
  await expect(
    page.getByRole("listitem").filter({ hasText: linkHost }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "清除", exact: true }).click();
  await expect(
    page.getByRole("listitem").filter({ hasText: linkHost }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
});
