import { test, expect } from "@playwright/test";
import { openCourse } from "./helpers";
test("personal learning goals, tasks, notes and track isolation persist in RTL and LTR", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openCourse(page, "personal");
  await page.getByLabel("Learning track").selectOption("personal");
  await page
    .getByRole("button", { name: "Create my first learning space" })
    .click();
  await page.getByLabel("Space name", { exact: true }).fill("Learn Spanish");
  await page
    .getByLabel("Learning goal", { exact: true })
    .fill("Hold a conversation in Spanish");
  await page
    .getByLabel("Current level", { exact: true })
    .selectOption("beginner");
  await page.getByLabel("Target date (optional)").fill("2027-01-01");
  await page.getByRole("button", { name: "Save space", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Learn Spanish", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Hold a conversation in Spanish", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add exam", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("Credit hours", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await page.getByLabel("Task title").fill("Learn greetings");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await page.getByLabel("Complete: Learn greetings", { exact: true }).check();
  await expect(page.locator(".personal-goal")).toContainText("1/1");
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Name").fill("My vocabulary");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Note content" })
    .fill("Hola means hello.");
  await expect(page.locator(".save-state")).toHaveText("Saved");
  await expect(
    page.getByText("Recorded current grade", { exact: false }),
  ).toHaveCount(0);
  await expect(page.locator(".analytics-section")).toContainText(
    "Completed tasks: 1/1",
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/personal-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  const link = page.url();
  await page.reload();
  await page.getByRole("tab", { name: "Notes", exact: true }).click();
  await page
    .getByRole("button", { name: "My vocabulary", exact: true })
    .click();
  await expect(page.getByRole("textbox", { name: "Note content" })).toHaveText(
    "Hola means hello.",
  );
  await page.getByLabel("Learning track").selectOption("semester");
  await expect(
    page.getByRole("heading", { name: "Your courses", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Learn Spanish", exact: true }),
  ).toHaveCount(0);
  await page.goto(link);
  await expect(
    page.getByRole("heading", { name: "Learn Spanish", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Switch language" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("heading", { name: "هدفك التعليمي", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
