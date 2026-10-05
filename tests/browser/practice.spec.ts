import { test, expect } from "@playwright/test";
import { openCourse } from "./helpers";
test("flashcard review and quiz mistakes survive reload", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openCourse(page, "practice");
  await page.getByRole("button", { name: "New deck", exact: true }).click();
  await page.getByLabel("Collection name").fill("Key cards");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create", exact: true })
    .click();
  await page.getByRole("button", { name: "Add card", exact: true }).click();
  await page.getByLabel("Card front").fill("What is a key?");
  await page.getByLabel("Card back").fill("A unique identifier");
  await page.getByRole("button", { name: "Save card" }).click();
  await page.getByRole("button", { name: /Review due cards/ }).click();
  await page.getByRole("button", { name: "Show answer" }).click();
  await expect(
    page.getByText("A unique identifier", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Good", exact: true }).click();
  await expect(
    page.getByText("All due cards are reviewed.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await page.getByRole("button", { name: "New quiz", exact: true }).click();
  await page.getByLabel("Collection name").fill("Key quiz");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create", exact: true })
    .click();
  await page.getByRole("button", { name: "Add question" }).click();
  await page.getByLabel("Question", { exact: true }).fill("Which is unique?");
  await page.getByLabel("Options (one per line)").fill("id\nname");
  await page.getByLabel("Correct answer", { exact: true }).fill("id");
  await page
    .getByLabel("Explanation", { exact: true })
    .fill("IDs uniquely identify records.");
  await page.getByLabel("Topic", { exact: true }).fill("Keys");
  await page.getByRole("button", { name: "Save question" }).click();
  await page.getByRole("button", { name: "Start quiz", exact: true }).click();
  await page.getByLabel("name", { exact: true }).check();
  await page.getByRole("button", { name: "Submit answers" }).click();
  await expect(
    page.getByRole("heading", { name: "Result: 0 / 1" }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await expect(
    page.locator(".analytics-section .analytic-number").last(),
  ).toHaveText("0.0%");
  await page.reload();
  await page
    .getByRole("button", { name: "Mistake notebook", exact: true })
    .click();
  await expect(page.locator(".practice-card .quiz-result")).toContainText(
    "IDs uniquely identify records.",
  );
  await page
    .getByRole("button", { name: "Mark understood", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Review again", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Analytics", exact: true }).click();
  await expect(page.getByText("0.0%", { exact: true })).toBeVisible();
  await expect(page.getByText("Keys", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
