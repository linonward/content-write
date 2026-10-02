import { rateLimit } from "@content-write/db/auth-schema";
import { getDb } from "@content-write/db/client";
import { expect, test } from "@playwright/test";
import { processOneJob } from "../../apps/worker/src/jobs";

process.env.AI_MODE = "mock";
const apiURL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

test("selects material in the compact bar, generates ideas and writes from a saved idea", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(60_000);
  await getDb().delete(rateLimit);
  await page.goto("/sign-in");
  await page.getByLabel("邮箱").fill(process.env.E2E_EMAIL ?? "");
  await page.getByLabel("密码").fill(process.env.E2E_PASSWORD ?? "");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/home$/);
  const title = `选择条素材 ${test.info().project.name} ${Date.now()}`;
  const created = await page.request.post(`${apiURL}/api/materials`, {
    headers: { origin: baseURL ?? "" },
    data: { title, content: "先写一段自己的经历，再决定如何展开观点。" },
  });
  expect(created.status()).toBe(201);
  const { material } = (await created.json()) as { material: { id: string } };
  const processed = await page.request.post(
    `${apiURL}/api/materials/${material.id}/process`,
    {
      headers: {
        origin: baseURL ?? "",
        "idempotency-key": crypto.randomUUID(),
      },
    },
  );
  expect(processed.status()).toBe(202);
  await expect(async () => {
    await processOneJob();
    const state = await page.request.get(
      `${apiURL}/api/materials/${material.id}/analysis`,
    );
    expect(
      ((await state.json()) as { analysis: unknown }).analysis,
    ).not.toBeNull();
  }).toPass({ timeout: 20_000 });
  await page.goto("/ideas");
  const generate = page.getByRole("button", { name: "生成 3 个选题" });
  await expect(generate).toBeDisabled();
  await page.getByRole("button", { name: "选择已整理素材" }).click();
  await page.getByRole("checkbox", { name: new RegExp(title) }).check();
  await expect(generate).toBeEnabled();
  await expect(
    page.getByRole("button", { name: `移除素材 ${title}` }),
  ).toBeVisible();
  await page.getByRole("button", { name: "选择已整理素材" }).click();
  await expect(
    page.getByRole("checkbox", { name: new RegExp(title) }),
  ).not.toBeVisible();
  await generate.click();
  await expect(async () => {
    await processOneJob();
    await expect(
      page.getByRole("status").filter({ hasText: "选题已生成" }),
    ).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  const results = page.getByRole("region", { name: "生成的选题" });
  const card = results.locator('[data-slot="card"]').first();
  await expect(card.getByText("证据缺口", { exact: true })).toBeVisible();
  await expect(card.getByText("模拟", { exact: true })).toBeVisible();
  await card.getByRole("button", { name: "收藏", exact: true }).click();
  await expect(card.getByText("已收藏", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "收藏", exact: true }).first().click();
  await expect(card.getByText("已收藏", { exact: true })).toBeVisible();
  await card.getByRole("button", { name: "创建文章并规划大纲" }).click();
  await expect(page).toHaveURL(/\/articles\/[0-9a-f-]+$/);
});
