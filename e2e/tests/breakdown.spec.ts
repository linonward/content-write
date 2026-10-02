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

  const nav = page
    .getByRole("navigation", { name: /主导航|底部导航/ })
    .filter({ visible: true });
  const links = nav.getByRole("link");
  for (const [index, name] of [
    "首页",
    "拆解",
    "素材箱",
    "选题",
    "文章",
  ].entries()) {
    await expect(links.nth(index)).toHaveAccessibleName(name);
  }
  await nav.getByRole("link", { name: "拆解" }).click();
  await expect(page).toHaveURL(/\/breakdowns$/);

  const title = `参考 ${test.info().project.name} ${Date.now()}`;
  await page.getByRole("button", { name: "拆解一篇爆款", exact: true }).click();
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
  await page.getByRole("button", { name: /^1/ }).click();
  await expect(original.locator("mark")).toHaveText(
    "30 岁那年，我从大厂辞职，以为终于自由了。",
  );
  // T030: a finished breakdown offers to write with its framework.
  await expect(
    page.getByRole("button", { name: "用这个框架写" }),
  ).toBeVisible();
  const back = page.getByRole("button", { name: "返回参考文章列表" });
  if (await back.isVisible()) {
    await back.click();
    await expect(
      page.getByRole("listitem").filter({ hasText: title }),
    ).toContainText("已拆解");
    await page
      .getByRole("listitem")
      .filter({ hasText: title })
      .getByRole("button")
      .click();
  } else {
    await expect(
      page.getByRole("listitem").filter({ hasText: title }),
    ).toContainText("已拆解");
  }

  await page.getByRole("button", { name: "删除" }).click();
  await page.getByRole("button", { name: "确认删除" }).click();
  await expect(page.getByRole("status")).toContainText("已删除参考文章");
  await expect(page.getByText(title)).toHaveCount(0);
});

test("saves a link without fetched text and opens the paste editor", async ({
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
  await page.goto("/breakdowns");

  const host = `t037-${test.info().project.name}-${Date.now()}.example.com`;
  await page.getByRole("button", { name: "拆解一篇爆款", exact: true }).click();
  await page.getByRole("button", { name: "保存链接", exact: true }).click();
  await page.getByLabel("公开链接").fill(`https://${host}/post`);
  await page.getByRole("button", { name: "保存参考文章" }).click();

  // Remote fetch is off in tests, so the editor opens for pasting right away.
  const paste = page.getByLabel("文章正文");
  await expect(paste).toBeFocused();
  await expect(page.getByRole("status")).toContainText("粘贴到下方再拆解");
  await paste.fill(article);
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "拆解这篇文章" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "删除" }).click();
  await page.getByRole("button", { name: "确认删除" }).click();
  await expect(page.getByRole("status")).toContainText("已删除参考文章");
});
