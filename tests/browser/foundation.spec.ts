import { test, expect } from "@playwright/test";
test("register, onboard, customize, persist, sign out and sign in on mobile", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const email = `student-${Date.now()}@example.com`;
  await page.goto("/");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.getByLabel("Your name").fill("Alex Learner");
  await page.getByLabel("Email address").fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("a-secure-password-123");
  await page.getByRole("button", { name: "Create your space" }).click();
  await expect(
    page.getByRole("heading", { name: "Hi Alex, where are we headed?" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Personal study Follow your curiosity." })
    .click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Ocean", exact: true }).click();
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await page.getByRole("button", { name: "Enter my workspace" }).click();
  await expect(
    page.getByRole("heading", { name: /Welcome home/ }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "ocean");
  await expect(page.locator("html")).toHaveAttribute("data-mode", "dark");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /Welcome home/ }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "ocean");
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  for (const theme of [
    "Forest",
    "Lavender",
    "Rose",
    "Ember",
    "Midnight",
    "Ocean",
  ]) {
    await page.getByRole("button", { name: theme, exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme",
      theme.toLowerCase(),
    );
  }
  await page.getByRole("button", { name: "System", exact: true }).click();
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-mode", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-mode", "dark");
  await page.getByRole("button", { name: "Switch language" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "فتح القائمة" }).click();
  await page
    .getByRole("button", { name: "إعدادات الحساب", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect
    .poll(() =>
      page.locator("aside").evaluate((el) => el.getBoundingClientRect().left),
    )
    .toBeGreaterThanOrEqual(390);
  await page.screenshot({
    path: "test-results/mobile-rtl.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "تسجيل الخروج", exact: true }).click();
  await page.getByRole("tab", { name: "تسجيل الدخول" }).click();
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByLabel("كلمة المرور").fill("a-secure-password-123");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page.getByRole("heading", { name: /أهلًا بك/ })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "تغيير اللغة" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await page.getByRole("button", { name: "Toggle color mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-mode", "light");
  await page.screenshot({
    path: "test-results/desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});
