import { rateLimit } from "@content-write/db/auth-schema";
import { getDb } from "@content-write/db/client";
import { expect, test } from "@playwright/test";
import { processOneJob } from "../../apps/worker/src/jobs";

// Playwright starts the API and web servers only; the test drives the worker with the same mock adapter.
test("extracts, reviews, confirms and manages memories with failure and stale feedback", async ({
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
  const card = page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByRole("heading", { name: "记忆", exact: true }) });
  await expect(card.getByText("0 / 50 条")).toBeVisible();
  await expect(card.getByText("还没有确认的记忆")).toBeVisible();
  const consent = page.getByRole("button", { name: "我已了解，继续使用" });
  if (await consent.first().isVisible()) await consent.first().click();

  const extract = card.getByRole("button", { name: "从历史文章提取候选" });
  await extract.click();
  await expect(card.getByRole("alert")).toContainText(
    "请先在“历史文章”中添加并启用",
  );

  const sampleTitle = `记忆来源 ${test.info().project.name}`;
  await page.getByLabel("历史文章标题").fill(sampleTitle);
  await page
    .getByLabel("历史文章正文")
    .fill("我习惯先用一句短句开头。然后讲一个具体场景。");
  await page.getByRole("button", { name: "添加历史文章", exact: true }).click();
  await expect(page.getByText("1 / 20 篇")).toBeVisible();

  await extract.click();
  await expect(card.getByText("正在提取", { exact: true })).toBeVisible();
  await expect(extract).toBeDisabled();
  const candidates = card.getByRole("region", { name: "待确认的候选" });
  await expect(async () => {
    await processOneJob();
    await expect(candidates).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await expect(card.getByRole("status")).toContainText("提取到 1 条候选记忆");
  const candidate = candidates.getByRole("article");
  await expect(candidate.getByText("模拟", { exact: true })).toBeVisible();
  await candidate.getByText("查看证据（1）").click();
  await expect(candidate.getByText("我习惯先用一句短句开头。")).toBeVisible();
  await expect(
    candidate.getByText(`出自历史文章《${sampleTitle}》`),
  ).toBeVisible();

  const reviewed = `开头先用一句短句 ${test.info().project.name}`;
  await candidate.getByRole("button", { name: "修改" }).click();
  await candidate.getByLabel("修改记忆").fill(reviewed);
  await candidate.getByRole("button", { name: "保存修改" }).click();
  await expect(card.getByRole("status")).toContainText("候选已修改");
  await candidates
    .getByRole("article", { name: `候选：${reviewed}` })
    .getByRole("button", { name: "确认使用" })
    .click();
  await expect(card.getByRole("status")).toContainText("已确认");
  await expect(candidates).toHaveCount(0);
  const confirmed = card.getByRole("article", { name: reviewed });
  await expect(confirmed.getByRole("switch")).toBeChecked();
  await expect(confirmed.getByText("从历史文章提取 · 版本 3")).toBeVisible();

  const manual = `结尾不喊口号 ${test.info().project.name}`;
  await card.getByLabel("写一条记忆").fill(manual);
  const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  await page.route(`${api}/api/memories`, async (route) => {
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
  await card.getByRole("button", { name: "添加并确认" }).click();
  await expect(card.getByRole("alert")).toContainText("服务暂时不可用");
  await expect(card.getByLabel("写一条记忆")).toHaveValue(manual);
  await page.unroute(`${api}/api/memories`);
  await card.getByRole("button", { name: "添加并确认" }).click();
  await expect(card.getByRole("status")).toContainText("已添加并确认");
  await expect(card.getByLabel("写一条记忆")).toHaveValue("");
  const written = card.getByRole("article", { name: manual });
  await expect(written.getByText("手动添加 · 版本 1")).toBeVisible();

  // A second client disables the memory; the first client's stale version must not overwrite it.
  const listed = await page.request.get(`${api}/api/memories`);
  const { memories } = (await listed.json()) as {
    memories: { id: string; content: string; version: number }[];
  };
  const target = memories.find((memory) => memory.content === manual);
  if (!target) throw new Error("manual memory missing");
  const origin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
  const changed = await page.request.patch(`${api}/api/memories/${target.id}`, {
    headers: { origin },
    data: { expectedVersion: target.version, status: "disabled" },
  });
  expect(changed.status()).toBe(200);
  await written.getByRole("switch").click();
  await expect(card.getByRole("alert")).toContainText("已在别处修改");
  await expect(written.getByRole("switch")).not.toBeChecked();
  await expect(written.getByText("已禁用", { exact: true })).toBeVisible();
  await written.getByRole("switch").click();
  await expect(written.getByRole("switch")).toBeChecked();
  await expect(card.getByRole("status")).toContainText("已启用");

  await page.reload();
  await expect(card.getByText("2 / 50 条")).toBeVisible();
  await expect(confirmed.getByRole("switch")).toBeChecked();
  await expect(written.getByRole("switch")).toBeChecked();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.locator("nextjs-portal [data-nextjs-dialog-overlay]"),
  ).toHaveCount(0);
  expect(runtimeErrors).toEqual([]);

  await written.getByRole("button", { name: "删除" }).click();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(written).toBeVisible();
  for (const row of [written, confirmed]) {
    await row.getByRole("button", { name: "删除" }).click();
    await page.getByRole("button", { name: "确认删除", exact: true }).click();
    await expect(row).toHaveCount(0);
  }
  await expect(card.getByRole("status")).toContainText("记忆已删除");
  // Leaves the shared e2e user without samples, as the samples spec expects.
  const samples = await page.request.get(`${api}/api/writing-samples`);
  for (const sample of ((await samples.json()) as { samples: { id: string }[] })
    .samples)
    await page.request.delete(`${api}/api/writing-samples/${sample.id}`, {
      headers: { origin },
    });
  await page.reload();
  await expect(card.getByText("0 / 50 条")).toBeVisible();
  await expect(page.getByText("0 / 20 篇")).toBeVisible();
});
