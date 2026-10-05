import { test, expect } from "@playwright/test";
import { pdfFixture } from "../helpers";
test("upload a PDF, read text, write autosaved notes, split panes and reload persisted content", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.getByLabel("Your name").fill("Content Student");
  await page
    .getByLabel("Email address")
    .fill(`content-${Date.now()}@example.com`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("content-password-123");
  await page.getByRole("button", { name: "Create your space" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Enter my workspace" }).click();
  await page.getByRole("button", { name: "Create my first semester" }).click();
  await page.getByLabel("Semester name").fill("Content Semester");
  await page.getByLabel("End date").fill("2027-12-01");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await page.getByRole("button", { name: "Add course", exact: true }).click();
  await page.getByLabel("Course name").fill("Reading Course");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await page.getByRole("link", { name: "Open workspace", exact: true }).click();
  await page.getByLabel("Upload material").setInputFiles({
    name: "lecture.pdf",
    mimeType: "application/pdf",
    buffer: pdfFixture(),
  });
  await page.getByRole("button", { name: "lecture.pdf", exact: true }).click();
  await expect(page.locator(".react-pdf__Page__textContent")).toContainText(
    "Study OS lecture fixture",
  );
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Name").fill("My lecture notes");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Note content" })
    .fill("Normalization keeps my data consistent.");
  await expect(page.locator(".save-state")).toHaveText("Saved");
  await page.reload();
  await page.getByRole("tab", { name: "Notes", exact: true }).click();
  await page
    .getByRole("button", { name: "My lecture notes", exact: true })
    .click();
  await expect(page.getByRole("textbox", { name: "Note content" })).toHaveText(
    "Normalization keeps my data consistent.",
  );
  await page.getByRole("tab", { name: "Materials", exact: true }).click();
  await page.getByRole("button", { name: "lecture.pdf", exact: true }).click();
  await page.getByRole("button", { name: "Split view", exact: true }).click();
  await page
    .getByLabel("Split view note")
    .selectOption({ label: "My lecture notes" });
  await expect(
    page.getByRole("textbox", { name: "Note content" }),
  ).toBeVisible();
  await page.getByRole("separator").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("separator")).toHaveAttribute(
    "aria-valuenow",
    "53",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
