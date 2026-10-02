import { rateLimit } from "@content-write/db/auth-schema";
import { getDb } from "@content-write/db/client";
import { expect, test } from "@playwright/test";

test("shows the landing page to signed-out visitors", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /^看懂一篇爆款，\s*写出你自己的那篇。$/,
    }),
  ).toBeVisible();

  // The only primary action is applying, by email until the application form has a backend.
  const apply = page.getByRole("link", { name: "申请试用" });
  const visible = await apply.filter({ visible: true }).count();
  expect(visible).toBeGreaterThanOrEqual(2);
  for (const href of await apply.evaluateAll((links) =>
    links.map((link) => link.getAttribute("href")),
  ))
    expect(href).toMatch(/^mailto:linonward@gmail\.com\?subject=/);

  // Development status is stated, never "可用"; the draft box is not built yet.
  const how = page.locator("#how");
  await expect(
    how.getByText("推送草稿箱", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    how.getByText("尚未开始", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(page.getByText("可用", { exact: true })).toHaveCount(0);

  // FAQ answers the plagiarism question up front; footer hides pages that do not exist yet.
  await expect(page.getByText("这算不算洗稿？")).toBeVisible();
  await expect(page.getByText(/^不算。拆解只提取结构与写法/)).toBeVisible();
  await expect(page.getByRole("link", { name: "隐私说明" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "使用条款" })).toHaveCount(0);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);

  await page.getByRole("link", { name: "已有账号？登录" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("sends signed-in authors from the landing page to home", async ({
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
  await page.goto("/");
  await expect(page).toHaveURL(/\/home$/);
});
