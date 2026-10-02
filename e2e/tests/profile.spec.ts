import { rateLimit } from "@content-write/db/auth-schema";
import { getDb } from "@content-write/db/client";
import { expect, test } from "@playwright/test";

test("saves the author profile and keeps it after reload", async ({ page }) => {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password)
    throw new Error("global setup did not create a user");
  // The suite signs in more often than the 5-per-minute limit allows; the limit has its own tests.
  await getDb().delete(rateLimit);
  await page.goto("/sign-in");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/home$/);

  await page
    .getByRole("button", { name: "账号菜单" })
    .filter({ visible: true })
    .click();
  await page.getByRole("menuitem", { name: "作者设置" }).click();
  await expect(page).toHaveURL(/\/settings\/profile$/);
  const save = page.getByRole("button", { name: "保存" });
  // The suite runs once per viewport against one user, so read what is there first.
  const bio = `独立开发者 ${test.info().project.name} ${Date.now()}`;
  await page.getByLabel("作者简介").fill(bio);
  await page.getByLabel("写作主题").fill("写作习惯，小团队协作、写作习惯");
  await page.getByLabel("目标读者").fill("工作 3 到 8 年的程序员");
  await page.getByLabel("表达偏好").fill("短句，先给结论");
  await page.getByLabel("禁用词").fill("赋能、闭环");
  await save.click();
  await expect(page.getByRole("status")).toContainText("已保存");
  await expect(save).toBeDisabled();

  await page.reload();
  await expect(page.getByLabel("作者简介")).toHaveValue(bio);
  // Lists are trimmed and de-duplicated, then shown joined with 、.
  await expect(page.getByLabel("写作主题")).toHaveValue("写作习惯、小团队协作");
  await expect(page.getByLabel("禁用词")).toHaveValue("赋能、闭环");
  await expect(page.getByText(/^版本 \d+$/)).toBeVisible();
});
