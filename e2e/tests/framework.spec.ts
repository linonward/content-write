import { rateLimit } from "@content-write/db/auth-schema";
import { getDb } from "@content-write/db/client";
import { expect, type Locator, test } from "@playwright/test";
import { processOneJob } from "../../apps/worker/src/jobs";

// Playwright starts the API and web servers only; the test drives the worker with the same mock adapter.
process.env.AI_MODE = "mock";

const apiURL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const reference = [
  "30 岁那年，我从大厂辞职，以为终于自由了。",
  "结果第三个月，我连早上几点起床都决定不了。",
  "后来我才明白，自由不是没人管，而是每件小事都得自己定规则。",
].join("\n\n");

/** Runs queued mock jobs until the expected result shows on the page. */
async function untilVisible(result: Locator) {
  await expect(async () => {
    await processOneJob();
    await expect(result).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

test("writes from a breakdown's framework through to a draft", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(90_000);
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

  // One analyzed material of the author's own, prepared through the API.
  const suffix = `${test.info().project.name} ${Date.now()}`;
  const material = await page.request.post(`${apiURL}/api/materials`, {
    headers: { origin: baseURL ?? "" },
    data: {
      title: `我的素材 ${suffix}`,
      content: "真正拖慢我的不是时间，而是没有固定的开始动作。",
    },
  });
  expect(material.status()).toBe(201);
  const materialId = ((await material.json()) as { material: { id: string } })
    .material.id;
  const analysis = await page.request.post(
    `${apiURL}/api/materials/${materialId}/process`,
    {
      headers: {
        origin: baseURL ?? "",
        "idempotency-key": crypto.randomUUID(),
      },
    },
  );
  expect(analysis.status()).toBe(202);
  await expect(async () => {
    await processOneJob();
    const state = await page.request.get(
      `${apiURL}/api/materials/${materialId}/analysis`,
    );
    expect(
      ((await state.json()) as { analysis: unknown }).analysis,
    ).not.toBeNull();
  }).toPass({ timeout: 20_000 });

  // Break down a reference article.
  await page.goto("/breakdowns");
  const title = `参考 ${suffix}`;
  await page.getByRole("button", { name: "拆解一篇爆款", exact: true }).click();
  await page.getByLabel("标题（可选）").fill(title);
  await page.getByLabel("文章正文").fill(reference);
  await page.getByRole("button", { name: "保存参考文章" }).click();
  await page.getByRole("button", { name: "拆解这篇文章" }).click();
  await untilVisible(page.getByRole("heading", { name: /段落槽位/ }));

  // Use its framework with the author's material; the brief is prefilled.
  await page.getByRole("button", { name: "用这个框架写" }).click();
  const dialog = page.getByRole("dialog", { name: "用这个框架写" });
  await dialog.getByRole("checkbox", { name: new RegExp(suffix) }).check();
  await expect(dialog.getByLabel("工作标题")).not.toHaveValue("");
  await expect(dialog.getByLabel("核心观点")).not.toHaveValue("");
  await dialog.getByRole("button", { name: "创建文章" }).click();
  await expect(page).toHaveURL(/\/articles\/[0-9a-f-]+$/);
  await expect(page.getByText("框架 · mock 开头 · 3 段")).toBeVisible();

  // Outline by slot: the one span supports the first slot, the rest are gaps.
  await page.getByRole("button", { name: "按框架和 brief 生成大纲" }).click();
  await untilVisible(page.getByText(/^槽位 1 ·/));
  await expect(page.getByText(/槽位 3 ·/)).toBeVisible();
  await expect(page.getByText("缺少素材")).toHaveCount(2);
  await expect(
    page.getByText("参考文章不会作为证据出现", { exact: false }),
  ).toBeVisible();

  // The author types a sentence of the reference into the outline. A draft that
  // carries it is not saved, and the author is told why.
  const points = page.getByLabel("要点（每行一条）").first();
  const own = await points.inputValue();
  const confirmAndDraft = async (keyPoints: string) => {
    await points.fill(keyPoints);
    await page.getByRole("button", { name: "保存大纲" }).click();
    await expect(page.getByText(/^大纲已保存/)).toBeVisible();
    await page.getByRole("button", { name: "确认大纲" }).click();
    await expect(page.getByText("大纲已确认，可以生成初稿。")).toBeVisible();
    await page.getByRole("button", { name: "根据大纲生成初稿" }).click();
  };
  await confirmAndDraft(reference.split("\n\n")[1]);
  await untilVisible(
    page.getByText(/生成结果里出现了参考文章的原文，这次结果没有保存/),
  );
  await expect(
    page.getByRole("heading", { name: "最近应用的初稿" }),
  ).toHaveCount(0);

  // With the author's own wording back, drafting continues unchanged.
  await confirmAndDraft(own);
  await untilVisible(page.getByRole("heading", { name: "最近应用的初稿" }));

  // The tag leads back to the breakdown.
  await page.getByText("框架 · mock 开头 · 3 段").click();
  await expect(page).toHaveURL(/\/breakdowns\?id=/);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
});
