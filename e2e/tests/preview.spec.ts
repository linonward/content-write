import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { rateLimit, user } from "@content-write/db/auth-schema";
import { getDb } from "@content-write/db/client";
import { articles } from "@content-write/db/schema";
import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";

// The article is written straight to the database: drafting is covered by its own tests,
// this one checks rendering and downloads.
const body = [
  "离职后的第一周，我把写作排进了每天的计划。",
  "## 时间多了，为什么反而写不出来",
  "- 没有固定的开始动作\n- 每天重新决定写什么",
  "> 拖慢我的从来不是时间。",
  "```\nnpm run write\n```",
  "---",
  "![封面](https://cdn.example/cover.png)",
  '<script>document.title="pwned"</script>',
  '<img src="https://cdn.example/x.png" onerror="document.title=\'pwned\'">',
  "[危险链接](javascript:alert(1))",
].join("\n\n");

test("previews an article at phone width and downloads Markdown and HTML", async ({
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
  const articleId = randomUUID();
  const title = `离职后的写作陷阱 ${test.info().project.name}`;
  await getDb().insert(articles).values({
    id: articleId,
    userId: author.id,
    workingTitle: title,
    audience: "刚离职的写作者",
    thesis: "固定的开始动作比时间更重要",
    sourceCount: 0,
    version: 3,
    title,
    body,
  });
  // Remote images must never be requested by the preview.
  const remote: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("cdn.example")) remote.push(request.url());
  });

  await getDb().delete(rateLimit);
  await page.goto("/sign-in");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/home$/);

  await page.goto(`/articles/${articleId}`);
  await page.getByRole("link", { name: "预览", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/articles/${articleId}/preview$`));

  const phone = page.getByRole("region", { name: "手机预览" });
  await expect(phone.getByRole("heading", { level: 1 })).toHaveText(title);
  await expect(
    phone.getByRole("heading", { name: "时间多了，为什么反而写不出来" }),
  ).toBeVisible();
  await expect(phone.getByRole("listitem")).toHaveText([
    "没有固定的开始动作",
    "每天重新决定写什么",
  ]);
  await expect(phone.locator("blockquote")).toHaveText(
    "拖慢我的从来不是时间。",
  );
  await expect(phone.locator("pre code")).toHaveText("npm run write");
  await expect(phone.locator("hr")).toHaveCount(1);
  await expect(
    phone.getByRole("link", { name: "[图片：封面]" }),
  ).toHaveAttribute("href", "https://cdn.example/cover.png");
  await expect(phone.locator("img, script, iframe")).toHaveCount(0);
  await expect(phone.getByText("危险链接")).not.toHaveAttribute("href");
  await expect(page).not.toHaveTitle("pwned");
  await expect(
    page.getByText("基础预览，微信编辑器可能调整最终样式。"),
  ).toBeVisible();

  // About 375px wide, and never wider than the viewport on a phone.
  const width = (await phone.boundingBox())?.width ?? 0;
  const viewport = page.viewportSize()?.width ?? 0;
  expect(width).toBeLessThanOrEqual(Math.min(375, viewport));
  expect(width).toBeGreaterThan(Math.min(375, viewport) - 60);

  const markdownDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载 Markdown" }).click();
  const markdown = await markdownDownload;
  expect(markdown.suggestedFilename()).toBe(`${title}.md`);
  expect(await readFile(await markdown.path(), "utf8")).toBe(
    `# ${title}\n\n${body}\n`,
  );

  const htmlDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载 HTML" }).click();
  const html = await htmlDownload;
  expect(html.suggestedFilename()).toBe(`${title}.html`);
  const exported = await readFile(await html.path(), "utf8");
  expect(exported).toContain(`<title>${title}</title>`);
  expect(exported).toContain("<h2>时间多了，为什么反而写不出来</h2>");
  expect(exported).toContain("[图片：封面]");
  for (const unsafe of ["<script", "<img", "onerror", "javascript:"])
    expect(exported).not.toContain(unsafe);

  expect(remote).toEqual([]);
  await page.getByRole("link", { name: "返回编辑" }).click();
  await expect(page).toHaveURL(new RegExp(`/articles/${articleId}$`));
});
