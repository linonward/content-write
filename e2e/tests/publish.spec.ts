import { randomUUID } from "node:crypto";
import { rateLimit, user } from "@content-write/db/auth-schema";
import { getDb } from "@content-write/db/client";
import { articles } from "@content-write/db/schema";
import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";

test("records a manual publication, lists it and deletes it", async ({
  page,
}) => {
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
  const title = `发布记录 ${test.info().project.name}`;
  await getDb().insert(articles).values({
    id: articleId,
    userId: author.id,
    workingTitle: title,
    audience: "写作者",
    thesis: "固定的开始动作比时间更重要",
    sourceCount: 0,
    version: 5,
    title,
    body: "离职后的第一周，我把写作排进了每天的计划。",
  });

  await getDb().delete(rateLimit);
  await page.goto("/sign-in");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/home$/);

  await page.goto(`/articles/${articleId}/preview`);
  await page.getByRole("link", { name: "去发布" }).click();
  await expect(page).toHaveURL(new RegExp(`/articles/${articleId}/publish$`));

  const steps = page.getByRole("region", { name: "手动发布步骤" });
  await expect(steps.getByText("导出并粘贴到公众号后台")).toBeVisible();
  await expect(
    steps.getByRole("link", { name: "去预览与导出" }),
  ).toHaveAttribute("href", `/articles/${articleId}/preview`);
  // The draft push (T031) is not built, so nothing may offer it.
  await expect(page.getByText("推送到草稿箱")).toHaveCount(0);

  const form = page.getByRole("region", { name: "记录发布" });
  const history = page.getByRole("region", { name: "历史记录" });
  await expect(history.getByText("还没有发布记录")).toBeVisible();
  await expect(form.getByText("对应文章版本：v5（当前）")).toBeVisible();

  await form.getByLabel("发布链接").fill("https://mp.weixin.qq.com/s/e2e-link");
  await form.getByLabel("发布时间").fill("2026/10/01 20:30");
  await form.getByRole("button", { name: "保存记录" }).click();
  await expect(form.getByText("已记录，绑定文章版本 5。")).toBeVisible();

  const link = history.getByRole("link", {
    name: "https://mp.weixin.qq.com/s/e2e-link",
  });
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow");
  await expect(
    history.getByText("用户标记已发布 · 2026/10/01 20:30 · 版本 5"),
  ).toBeVisible();
  await expect(page.getByText("微信 API 已确认")).toHaveCount(0);

  await form.getByLabel("发布链接").fill("https://mp.weixin.qq.com/s/e2e-link");
  await form.getByRole("button", { name: "保存记录" }).click();
  await expect(form.getByText("这个链接已经记录过了。")).toBeVisible();

  await page.reload();
  await expect(history.getByText("2026/10/01 20:30")).toBeVisible();

  await history.getByRole("button", { name: "删除" }).click();
  await page.getByRole("button", { name: "删除记录" }).click();
  await expect(
    page.getByText("已删除这条发布记录，文章未改动。"),
  ).toBeVisible();
  await expect(history.getByText("还没有发布记录")).toBeVisible();

  await page.getByRole("link", { name: "返回编辑" }).click();
  await expect(page).toHaveURL(new RegExp(`/articles/${articleId}$`));
  await expect(
    page.getByRole("link", { name: "发布", exact: true }),
  ).toBeVisible();
});
