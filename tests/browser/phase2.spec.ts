import { test, expect, type Page } from "@playwright/test";
import { readdir, readFile } from "node:fs/promises";
async function emailLink(email: string, purpose: string) {
  let found = "";
  await expect
    .poll(async () => {
      const files = await readdir("/tmp/study-os-e2e-mail");
      for (const file of files.reverse()) {
        const m = JSON.parse(
          await readFile(`/tmp/study-os-e2e-mail/${file}`, "utf8"),
        );
        if (m.to === email && m.purpose === purpose) {
          found = m.url;
          return true;
        }
      }
      return false;
    })
    .toBe(true);
  return found;
}
async function register(page: Page, email: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.getByLabel("Your name").fill("Dana Student");
  await page.getByLabel("Email address").fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("initial-password-123");
  await page.getByRole("button", { name: "Create your space" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Enter my workspace" }).click();
  await expect(
    page.getByRole("heading", { name: /Welcome home/ }),
  ).toBeVisible();
}
async function saveDialog(page: Page) {
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
test("semesters, course workspaces and database-driven task progress persist in RTL and LTR", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const email = `semester-${Date.now()}@example.com`;
  await register(page, email);
  await expect(
    page.getByRole("heading", {
      name: "Every semester starts with a first step.",
    }),
  ).toBeVisible();
  await page.goto(await emailLink(email, "verify"));
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Email confirmed" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText("Email verified", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Create my first semester" }).click();
  await page.getByLabel("Semester name").fill("Autumn 2026");
  await page.getByLabel("Start date").fill("2026-09-01");
  await page.getByLabel("End date").fill("2027-01-31");
  await saveDialog(page);
  await page.getByRole("button", { name: "Add course", exact: true }).click();
  await page.getByLabel("Course name").fill("Database Systems");
  await page.getByLabel("Course code").fill("CS301");
  await page.getByLabel("Credit hours", { exact: true }).fill("3");
  await page.getByLabel("Choose course color").fill("#7960b0");
  await saveDialog(page);
  await expect(
    page.locator(".stat-card").filter({ hasText: "Courses" }).locator("strong"),
  ).toHaveText("1");
  await expect(
    page
      .locator(".stat-card")
      .filter({ hasText: "Credit hours" })
      .locator("strong"),
  ).toHaveText("3");
  await page.getByRole("link", { name: "Open workspace", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Database Systems", level: 1 }),
  ).toBeVisible();
  const courseUrl = page.url();
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await page.getByLabel("Task title").fill("Review normalization");
  await page.getByLabel("Due date (optional)").fill("2026-10-05");
  await saveDialog(page);
  await page
    .getByRole("checkbox", { name: "Complete: Review normalization" })
    .check();
  await expect(
    page.getByRole("progressbar", { name: "Task completion" }),
  ).toHaveAttribute("aria-valuenow", "100");
  await page.reload();
  await expect(
    page.getByRole("checkbox", { name: "Complete: Review normalization" }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Edit course", exact: true }).click();
  await page.getByLabel("Course name").fill("Advanced Databases");
  await page.getByLabel("Credit hours", { exact: true }).fill("4");
  await saveDialog(page);
  await expect(
    page.getByRole("heading", { name: "Advanced Databases", level: 1 }),
  ).toBeVisible();
  await page.getByRole("button", { name: "All courses", exact: true }).click();
  await expect(
    page
      .locator(".stat-card")
      .filter({ hasText: "Tasks completed" })
      .locator("strong"),
  ).toHaveText("1");
  await expect(
    page
      .locator(".stat-card")
      .filter({ hasText: "Credit hours" })
      .locator("strong"),
  ).toHaveText("4");
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await page.getByRole("button", { name: "Ocean", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "ocean");
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(page.locator(".course-emblem").first()).toHaveCSS(
    "background-color",
    "rgb(121, 96, 176)",
  );
  await page.getByRole("button", { name: "New semester", exact: true }).click();
  await page.getByLabel("Semester name").fill("Spring 2027");
  await page.getByLabel("Start date").fill("2027-02-01");
  await page.getByLabel("End date").fill("2027-06-30");
  await saveDialog(page);
  await page
    .getByLabel("Select semester")
    .selectOption({ label: "Spring 2027" });
  await expect(
    page.locator(".stat-card").filter({ hasText: "Courses" }).locator("strong"),
  ).toHaveText("0");
  await page
    .getByLabel("Select semester")
    .selectOption({ label: "Autumn 2026" });
  await expect(
    page.locator(".stat-card").filter({ hasText: "Courses" }).locator("strong"),
  ).toHaveText("1");
  await page.screenshot({
    path: "test-results/phase2-dashboard.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Switch language" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "مساقاتك" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/phase2-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.goto(courseUrl);
  await expect(
    page.getByRole("heading", { name: "Advanced Databases", level: 1 }),
  ).toBeVisible();
  await page.getByRole("button", { name: "حذف المساق", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "حذف نهائي", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "هنا مكان مساقك الأول." }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("forgot-password email link updates credentials and revokes the existing browser session", async ({
  page,
}) => {
  const email = `recovery-${Date.now()}@example.com`;
  await register(page, email);
  await page
    .getByRole("button", { name: "Account settings", exact: true })
    .click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("tab", { name: "Sign in", exact: true }).click();
  await page
    .getByRole("button", { name: "Forgot password?", exact: true })
    .click();
  await page.getByRole("dialog").getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Request reset link" }).click();
  await expect(page.getByRole("dialog").getByRole("status")).toContainText(
    "If an account exists",
  );
  await page
    .getByRole("button", { name: "Back to sign in", exact: true })
    .click();
  await page.getByLabel("Email address").fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("initial-password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /Welcome home/ }),
  ).toBeVisible();
  await page.goto(await emailLink(email, "reset"));
  await page
    .getByLabel("New password", { exact: true })
    .fill("new-password-12345");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("does-not-match");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByRole("alert")).toHaveText("Passwords must match.");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("new-password-12345");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(
    page.getByRole("heading", { name: "Password updated" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("tab", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Email address").fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("initial-password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Email or password is incorrect.",
  );
  await page.getByLabel("Password", { exact: true }).fill("new-password-12345");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /Welcome home/ }),
  ).toBeVisible();
});
