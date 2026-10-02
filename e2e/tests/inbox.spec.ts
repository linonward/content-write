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

  // Imported materials are titled after the file name.
  const title = `导入素材-${Date.now()}`;
  await page.getByLabel("选择 Markdown 或纯文本文件").setInputFiles({
    name: `${title}.md`,
    mimeType: "text/markdown",
    buffer: Buffer.from("先把零散的想法记下来。"),
  });
  await expect(page.getByText(`${title}.md`)).toBeVisible();
  await page.getByRole("button", { name: "导入文件" }).click();
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
