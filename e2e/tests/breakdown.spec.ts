import { rateLimit } from "@content-write/db/auth-schema";
import { getDb } from "@content-write/db/client";
import { expect, test } from "@playwright/test";
import { processOneJob } from "../../apps/worker/src/jobs";

// Playwright starts the API and web servers only; the test drives the worker with the same mock adapter.
process.env.AI_MODE = "mock";

const article = [
  "30 岁那年，我从大厂辞职，以为终于自由了。",
  "结果第三个月，我连早上几点起床都决定不了。",
  "后来我才明白，自由不是没人管，而是每件小事都得自己定规则。",
  "你呢？你给自己定过什么规则？",
].join("\n\n");

test("pastes an article, breaks it down and checks the original", async ({
  page,
}) => {
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

  const nav = page.getByRole("navigation", { name: "主导航" });
  await expect(nav.getByRole("link")).toHaveText([
    "首页",
    "拆解",
    "素材箱",
    "选题",
    "文章",
  ]);
  await nav.getByRole("link", { name: "拆解" }).click();
  await expect(page).toHaveURL(/\/breakdowns$/);

  const title = `参考 ${test.info().project.name} ${Date.now()}`;
  await page.getByLabel("标题（可选）").fill(title);
  await page.getByLabel("文章正文").fill(article);
  await page.getByRole("button", { name: "保存参考文章" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  const consent = page.getByRole("button", { name: "我已了解，继续使用" });
  if (await consent.isVisible()) await consent.click();
  await page.getByRole("button", { name: "拆解这篇文章" }).click();
  await expect(page.getByRole("button", { name: "拆解中…" })).toBeVisible();

  const slots = page.getByRole("heading", { name: /段落槽位/ });
  await expect(async () => {
    await processOneJob();
    await expect(slots).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });

  const original = page.getByRole("region", { name: "原文" });
  await expect(original.locator("mark")).toHaveCount(0);
  await page.getByRole("button", { name: /^1\./ }).click();
  await expect(original.locator("mark")).toHaveText(
    "30 岁那年，我从大厂辞职，以为终于自由了。",
  );
  await expect(page.getByRole("button", { name: /用这个框架写/ })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("listitem").filter({ hasText: title }),
  ).toContainText("已拆解");

  await page.getByRole("button", { name: "删除" }).click();
  await page.getByRole("button", { name: "确认删除" }).click();
  await expect(page.getByRole("status")).toContainText("已删除参考文章");
  await expect(page.getByText(title)).toHaveCount(0);
});
