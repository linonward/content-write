import { rateLimit } from "@content-write/db/auth-schema";
import { getDb } from "@content-write/db/client";
import { expect, test } from "@playwright/test";

test("manages historical articles, preserves failed input and refreshes stale state", async ({
  page,
}) => {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password)
    throw new Error("global setup did not create a user");
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  await getDb().delete(rateLimit);
  await page.goto("/sign-in");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goto("/settings/profile");
  await expect(
    page.getByRole("heading", { name: "作者设置", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("0 / 20 篇")).toBeVisible();
  const title = `我的历史文章 ${test.info().project.name}`;
  const content =
    "我喜欢短句。先说结论，再讲一个自己经历过的细节。\n\n停下来，留一点空白。";
  await page.getByLabel("历史文章标题").fill(title);
  await page.getByLabel("历史文章正文").fill(content);
  const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  await page.route(`${api}/api/writing-samples`, async (route) => {
    if (route.request().method() === "POST")
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: { message: "服务暂时不可用，请稍后重试。" },
        }),
      });
    else await route.continue();
  });
  await page.getByRole("button", { name: "添加历史文章", exact: true }).click();
  await expect(
    page
      .locator('[data-slot="card"]')
      .filter({
        has: page.getByRole("heading", { name: "历史文章", exact: true }),
      })
      .getByRole("alert"),
  ).toContainText("服务暂时不可用");
  await expect(page.getByLabel("历史文章标题")).toHaveValue(title);
  await expect(page.getByLabel("历史文章正文")).toHaveValue(content);
  await page.unroute(`${api}/api/writing-samples`);
  await page.getByRole("button", { name: "添加历史文章", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已添加并启用");
  const row = page.getByRole("article", { name: title });
  const toggle = row.getByRole("switch");
  await expect(toggle).toBeChecked();
  await expect(page.getByLabel("历史文章正文")).toHaveValue("");
  await page.reload();
  await expect(row).toBeVisible();
  await row.getByText("查看正文", { exact: true }).click();
  await expect(row.getByText(content, { exact: true })).toBeVisible();
  // Real second client changes state; the first client's stale version must not overwrite it.
  const list = await page.request.get(`${api}/api/writing-samples`);
  const { samples } = (await list.json()) as {
    samples: { id: string; version: number }[];
  };
  const changed = await page.request.patch(
    `${api}/api/writing-samples/${samples[0].id}`,
    {
      headers: { origin: process.env.WEB_ORIGIN ?? "http://localhost:3000" },
      data: { expectedVersion: samples[0].version, enabled: false },
    },
  );
  expect(changed.status()).toBe(200);
  await toggle.click();
  await expect(
    page
      .locator('[data-slot="card"]')
      .filter({
        has: page.getByRole("heading", { name: "历史文章", exact: true }),
      })
      .getByRole("alert"),
  ).toContainText("状态已在别处修改");
  await expect(toggle).not.toBeChecked();
  await toggle.click();
  await expect(toggle).toBeChecked();
  await expect(page.getByRole("status")).toContainText("已启用");
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await page.reload();
  await expect(toggle).not.toBeChecked();
  await row.getByText("查看正文", { exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.locator("nextjs-portal [data-nextjs-dialog-overlay]"),
  ).toHaveCount(0);
  expect(runtimeErrors).toEqual([]);
  await row.getByRole("button", { name: "删除历史文章" }).click();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "删除历史文章" }).click();
  await page.getByRole("button", { name: "确认删除", exact: true }).click();
  await expect(row).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("已删除");
  await page.reload();
  await expect(page.getByText("0 / 20 篇")).toBeVisible();
});
