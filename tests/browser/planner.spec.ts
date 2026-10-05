import { test, expect } from "@playwright/test";
test("calendar event persists and focus resumes after reload in Arabic and English", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.getByLabel("Your name").fill("Focus Student");
  await page
    .getByLabel("Email address")
    .fill(`focus-${Date.now()}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill("focus-password-123");
  await page.getByRole("button", { name: "Create your space" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Enter my workspace" }).click();
  await page.getByRole("button", { name: "Create my first semester" }).click();
  await page.getByLabel("Semester name").fill("Focus Semester");
  await page.getByLabel("End date").fill("2027-12-01");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await page.getByRole("button", { name: "Add course", exact: true }).click();
  await page.getByLabel("Course name").fill("Focus Course");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await page.getByRole("button", { name: "Add event" }).click();
  await page.getByLabel("Event title").fill("Read lecture");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(page.getByText("Read lecture", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Focus", exact: true }).click();
  await page.getByLabel("Study topic").fill("Practice problems");
  await page.getByRole("button", { name: "Start focus" }).click();
  await expect(page.getByRole("timer")).toBeVisible();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const clock = await page.getByRole("timer").innerText();
  await page.reload();
  await page.getByRole("button", { name: "Focus", exact: true }).click();
  await expect(page.getByRole("timer")).toHaveText(clock);
  await page.getByRole("button", { name: "Resume" }).click();
  await page.getByRole("button", { name: "Finish & save" }).click();
  await expect(page.locator(".study-history")).toContainText(
    "Practice problems",
  );
  await page.getByRole("button", { name: "Switch language" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
