import type { Page } from "@playwright/test";
export async function openCourse(page: Page, prefix: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.getByLabel("Your name").fill("Practice Student");
  await page
    .getByLabel("Email address")
    .fill(`${prefix}-${Date.now()}@example.com`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("practice-password-123");
  await page.getByRole("button", { name: "Create your space" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Enter my workspace" }).click();
  await page.getByRole("button", { name: "Create my first semester" }).click();
  await page.getByLabel("Semester name").fill("Practice Semester");
  await page.getByLabel("End date").fill("2027-12-01");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await page.getByRole("button", { name: "Add course", exact: true }).click();
  await page.getByLabel("Course name").fill("Practice Course");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await page.getByRole("link", { name: "Open workspace", exact: true }).click();
}
