import { randomUUID } from "node:crypto";
import { rateLimit, user } from "@content-write/db/auth-schema";
import { getDb } from "@content-write/db/client";
import { articles } from "@content-write/db/schema";
import { expect, type Locator, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { processOneJob } from "../../apps/worker/src/jobs";

// Playwright starts the API and web servers only; the test drives the worker with the same mock adapter.
process.env.AI_MODE = "mock";

/** Runs queued mock jobs until the expected result shows on the page. */
async function untilVisible(result: Locator) {
  await expect(async () => {
    await processOneJob();
    await expect(result).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

test("suggests an AI edit for a selection, applies it, and marks a stale one", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password)
    throw new Error("global setup did not create a user");
  const [author] = await getDb()
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email));
  // The body is written straight to the database: drafting has its own tests.
  const articleId = randomUUID();
  const title = `AI 修改 ${test.info().project.name}`;
  await getDb().insert(articles).values({
    id: articleId,
    userId: author.id,
    workingTitle: title,
    audience: "写作者",
    thesis: "固定的开始动作比时间更重要",
    sourceCount: 0,
    version: 3,
    title,
    body: "我们今天要讨论写作。\n\n第二段保持不变。",
  });

  await getDb().delete(rateLimit);
  await page.goto("/sign-in");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goto(`/articles/${articleId}`);

  const panel = page.getByRole("complementary", { name: "AI 修改" });
  const generate = panel.getByRole("button", { name: "生成修改建议" });
  await expect(panel.getByText("在正文中选中要修改的文字。")).toBeVisible();
  await expect(generate).toBeDisabled();

  // Select the first line of the body.
  const editor = page.locator("#article-body");
  await editor.click();
  await page.keyboard.press("ControlOrMeta+Home");
  await page.keyboard.press("Shift+End");
  await expect(
    panel.getByText("已选 10 字：「我们今天要讨论写作。」"),
  ).toBeVisible();
  await panel.getByRole("button", { name: "更精简" }).click();
  await generate.click();

  const suggestion = panel.locator("ins", { hasText: "（模拟修改：更精简）" });
  await untilVisible(suggestion);
  await expect(panel.getByText("选区修改")).toBeVisible();
  await expect(panel.getByText("mock 生成").last()).toBeVisible();
  await panel.getByRole("button", { name: "应用", exact: true }).click();
  await expect(panel.getByText("已应用修改，正文保存为版本 4。")).toBeVisible();
  await expect(editor).toContainText(
    "我们今天要讨论写作。（模拟修改：更精简）",
  );
  await expect(editor).toContainText("第二段保持不变。");
  await expect(page.getByText("AI 修改", { exact: true }).last()).toBeVisible();

  // A full-text suggestion goes stale once the author edits the body.
  await panel.getByText("全文", { exact: true }).click();
  await panel.getByLabel("修改要求").fill("整体更口语");
  await generate.click();
  const full = panel.getByText("全文修改");
  await untilVisible(full);
  await editor.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText("补一句。");
  await expect(page.getByText("已保存", { exact: true })).toBeVisible();
  await expect(panel.getByText("这条建议已过期")).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "应用", exact: true }),
  ).toBeDisabled();
  await panel.getByRole("button", { name: "拒绝" }).click();
  await expect(panel.getByText("已拒绝这条建议，正文未改动。")).toBeVisible();
  await expect(full).toHaveCount(0);

  await page.reload();
  await expect(page.locator("#article-body")).toContainText(
    "我们今天要讨论写作。（模拟修改：更精简）",
  );
  await expect(page.locator("#article-body")).toContainText("补一句。");
});
