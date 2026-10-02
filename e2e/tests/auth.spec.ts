import { expect, test } from "@playwright/test";

function credentials() {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password)
    throw new Error("global setup did not create a user");
  return { email, password };
}

test("redirects signed-out visitors to sign-in", async ({ page }) => {
  await page.goto("/home");
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("heading", { name: "登录拆写" })).toBeVisible();
});

test("rejects a wrong password without leaving sign-in", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("邮箱").fill(credentials().email);
  await page.getByLabel("密码").fill("not-the-right-password");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("signs in, reaches home and signs out", async ({ page }) => {
  const { email, password } = credentials();
  await page.goto("/sign-in");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(
    page.getByRole("heading", { name: "你好，E2E 作者。" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "退出登录" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/home");
  await expect(page).toHaveURL(/\/sign-in$/);
});
