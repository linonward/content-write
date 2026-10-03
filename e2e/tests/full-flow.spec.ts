import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { rateLimit, user } from "@content-write/db/auth-schema";
import { getDb } from "@content-write/db/client";
import { expect, type Locator, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { auth } from "../../apps/api/src/modules/identity/auth";
import { processOneJob } from "../../apps/worker/src/jobs";

// Playwright starts the API and web servers only; the test drives the worker with the same mock adapter.
// Remote fetch needs real sites, so content is pasted here; `smoke:link-fetch` covers fetching.
process.env.AI_MODE = "mock";

const material = [
  "离职后的第一个月，我以为自己会有大把时间写东西。",
  "真正拖慢我的不是时间，而是没有一个固定的开始动作。",
  "后来我把每天早上的第一件事改成整理前一天的笔记，这个月写完了 4 篇。",
].join("\n\n");
const reference = [
  "30 岁那年，我从大厂辞职，以为终于自由了。",
  "结果第三个月，我连早上几点起床都决定不了。",
  "后来我才明白，自由不是没人管，而是每件小事都得自己定规则。",
].join("\n\n");
const handEdit = "这一句是作者手动补上的。";

/** Runs queued mock jobs until the expected result shows on the page. */
async function untilVisible(result: Locator) {
  await expect(async () => {
    await processOneJob();
    await expect(result).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

/** Local time in the publish form's `YYYY/MM/DD HH:mm` format. */
function publishTime(minutesFromNow: number) {
  const at = new Date(Date.now() + minutesFromNow * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}/${pad(at.getMonth() + 1)}/${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

// This flow runs seven AI jobs; its own author keeps them out of the shared user's daily quota.
let email = "";
let password = "";
let authorId = "";
test.beforeEach(async () => {
  email = `e2e-flow-${randomUUID()}@example.test`;
  password = randomBytes(18).toString("base64url");
  const created = await auth.api.createUser({
    body: { email, name: "完整流程作者", password, role: "user" },
  });
  authorId = created.user.id;
});
test.afterEach(async () => {
  await getDb().delete(user).where(eq(user.id, authorId));
});

test("goes from a material and a breakdown to a recorded publication", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const suffix = `${test.info().project.name} ${Date.now()}`;
  const materialTitle = `完整流程素材 ${suffix}`;

  await test.step("sign in", async () => {
    // The suite signs in more often than the 5-per-minute limit allows; the limit has its own tests.
    await getDb().delete(rateLimit);
    await page.goto("/sign-in");
    await page.getByLabel("邮箱").fill(email);
    await page.getByLabel("密码").fill(password);
    await page.getByRole("button", { name: "登录" }).click();
    await expect(page).toHaveURL(/\/home$/);
  });

  await test.step("save a material and analyze it", async () => {
    await page.getByRole("link", { name: "添加素材", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "添加素材" });
    await dialog.getByLabel("标题", { exact: true }).fill(materialTitle);
    await dialog.getByLabel("正文", { exact: true }).fill(material);
    await dialog.getByRole("button", { name: "保存素材" }).click();
    await expect(
      page.getByRole("heading", { name: materialTitle }),
    ).toBeVisible();
    const analysis = page.getByRole("region", { name: "素材整理" });
    await analysis.getByRole("button", { name: "整理当前版本" }).click();
    await untilVisible(analysis.getByRole("heading", { name: "摘要" }));
  });

  await test.step("break down a reference article", async () => {
    await page.goto("/breakdowns");
    await page
      .getByRole("button", { name: "拆解一篇爆款", exact: true })
      .click();
    await page.getByLabel("标题（可选）").fill(`完整流程参考 ${suffix}`);
    await page.getByLabel("文章正文").fill(reference);
    await page.getByRole("button", { name: "保存参考文章" }).click();
    await page.getByRole("button", { name: "拆解这篇文章" }).click();
    await untilVisible(page.getByRole("heading", { name: /段落槽位/ }));
  });

  await test.step("generate ideas and create an article", async () => {
    await page.goto("/ideas");
    await page.getByRole("button", { name: "选择已整理素材" }).click();
    await page
      .getByRole("checkbox", { name: new RegExp(materialTitle) })
      .check();
    await page.getByRole("button", { name: "选择已整理素材" }).click();
    await page.getByRole("button", { name: "生成 3 个选题" }).click();
    await untilVisible(
      page.getByRole("status").filter({ hasText: "选题已生成" }),
    );
    await page
      .getByRole("region", { name: "生成的选题" })
      .locator('[data-slot="card"]')
      .first()
      .getByRole("button", { name: "创建文章并规划大纲" })
      .click();
    await expect(page).toHaveURL(/\/articles\/[0-9a-f-]+$/);
  });

  await test.step("outline and draft", async () => {
    await expect(page.getByLabel("工作标题")).not.toHaveValue("");
    await page.getByRole("button", { name: "根据 brief 生成大纲" }).click();
    await untilVisible(page.getByText("大纲待确认"));
    await page.getByRole("button", { name: "确认大纲" }).click();
    await expect(page.getByText("大纲已确认，可以生成初稿。")).toBeVisible();
    await page.getByRole("button", { name: "根据大纲生成初稿" }).click();
    await untilVisible(page.getByRole("heading", { name: "最近应用的初稿" }));
    await expect(page.locator("#article-body")).not.toBeEmpty();
  });

  const editor = page.locator("#article-body");
  await test.step("edit by hand, then apply an AI edit", async () => {
    await editor.click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.insertText(`\n\n${handEdit}`);
    await expect(page.getByText("已保存", { exact: true })).toBeVisible();

    await editor.click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("Shift+End");
    const panel = page.getByRole("complementary", { name: "AI 修改" });
    await expect(panel.getByText(/已选 \d+ 字/)).toBeVisible();
    await panel.getByRole("button", { name: "更精简" }).click();
    await panel.getByRole("button", { name: "生成修改建议" }).click();
    await untilVisible(
      panel.locator("ins", { hasText: "（模拟修改：更精简）" }),
    );
    await panel.getByRole("button", { name: "应用", exact: true }).click();
    await expect(
      panel.getByText(/已应用修改，正文保存为版本 \d+。/),
    ).toBeVisible();
    await expect(editor).toContainText("（模拟修改：更精简）");
  });

  await test.step("restore the version before the AI edit", async () => {
    await page.reload();
    // Newest first: the current version cannot be restored, the next one is the hand edit.
    const restore = page.getByRole("button", { name: "恢复此版本" });
    await expect(restore.first()).toBeDisabled();
    await restore.nth(1).click();
    await page.getByRole("button", { name: "确认恢复" }).click();
    await expect(editor).not.toContainText("（模拟修改：更精简）");
    await expect(editor).toContainText(handEdit);
  });

  await test.step("preview and download the restored text", async () => {
    await page.getByRole("link", { name: "预览", exact: true }).click();
    await expect(page).toHaveURL(/\/preview$/);
    await expect(page.getByRole("region", { name: "手机预览" })).toContainText(
      handEdit,
    );
    for (const [button, extension] of [
      ["下载 Markdown", "md"],
      ["下载 HTML", "html"],
    ]) {
      const download = page.waitForEvent("download");
      await page.getByRole("button", { name: button }).click();
      const file = await download;
      expect(file.suggestedFilename()).toMatch(new RegExp(`\\.${extension}$`));
      const text = await readFile(await file.path(), "utf8");
      expect(text).toContain(handEdit);
      expect(text).not.toContain("（模拟修改：更精简）");
    }
  });

  await test.step("record the publication", async () => {
    await page.getByRole("link", { name: "去发布" }).click();
    const form = page.getByRole("region", { name: "记录发布" });
    await form
      .getByLabel("发布链接")
      .fill(`https://mp.weixin.qq.com/s/full-flow-${Date.now()}`);
    // A time well in the future is refused.
    await form.getByLabel("发布时间").fill(publishTime(120));
    await form.getByRole("button", { name: "保存记录" }).click();
    await expect(form.getByText(/不晚于现在的发布时间/)).toBeVisible();
    await form.getByLabel("发布时间").fill(publishTime(-10));
    await form.getByRole("button", { name: "保存记录" }).click();
    await expect(form.getByText(/已记录，绑定文章版本 \d+。/)).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "历史记录" })
        .getByText("用户标记已发布", { exact: false }),
    ).toBeVisible();
  });
});
