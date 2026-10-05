import { test, expect } from "@playwright/test";
test("real grading items and exam results update current grade and GPA", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.getByLabel("Your name").fill("Grade Student");
  await page
    .getByLabel("Email address")
    .fill(`grades-${Date.now()}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill("grade-password-123");
  await page.getByRole("button", { name: "Create your space" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Enter my workspace" }).click();
  await page.getByRole("button", { name: "Create my first semester" }).click();
  await page.getByLabel("Semester name").fill("Grade Semester");
  await page.getByLabel("End date").fill("2027-12-01");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await page.getByRole("button", { name: "Add course", exact: true }).click();
  await page.getByLabel("Course name").fill("Graded Course");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await page.getByRole("link", { name: "Open workspace", exact: true }).click();
  await page.getByRole("button", { name: "Add grade item" }).click();
  await page.getByRole("dialog").getByLabel("Name").fill("Assignment");
  await page.getByLabel("Weight (%)", { exact: true }).fill("20");
  await page.getByLabel("Actual mark (optional)").fill("80");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(page.locator(".grade-summary-grid strong").first()).toHaveText(
    "80.0%",
  );
  await page.getByRole("button", { name: "Add exam", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Name").fill("Final Exam");
  await page.getByLabel("Exam date & time").fill("2027-01-10T10:00");
  await page.getByLabel("Weight (%)", { exact: true }).fill("80");
  await page.getByLabel("Actual mark (optional)").fill("90");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(page.locator(".grade-summary-grid strong").first()).toHaveText(
    "88.0%",
  );
  await page.reload();
  await expect(page.locator(".grade-summary-grid strong").first()).toHaveText(
    "88.0%",
  );
  await page.getByRole("button", { name: "All courses", exact: true }).click();
  await expect(page.locator(".gpa-values strong")).toHaveText("3.00");
  await page.getByRole("button", { name: "GPA scale settings" }).click();
  await page.getByLabel("Scale", { exact: true }).selectOption("100");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(page.locator(".gpa-values strong")).toHaveText("88.00");
  expect(errors).toEqual([]);
});
