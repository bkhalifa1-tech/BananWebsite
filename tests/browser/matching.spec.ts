import { test, expect } from "@playwright/test";
import { openCourse } from "./helpers";
test("matching and problem solving questions work through the actual form and results", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openCourse(page, "matching");
  await page.getByRole("button", { name: "New quiz", exact: true }).click();
  await page.getByLabel("Collection name").fill("Matching quiz");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create", exact: true })
    .click();
  await page.getByRole("button", { name: "Add question" }).click();
  await page
    .getByLabel("Question type", { exact: true })
    .selectOption("matching");
  await page.getByLabel("Question", { exact: true }).fill("Match the capitals");
  await page.getByLabel("Left item 1", { exact: true }).fill("France");
  await page.getByLabel("Matching answer 1", { exact: true }).fill("Paris");
  await page.getByLabel("Left item 2", { exact: true }).fill("Japan");
  await page.getByLabel("Matching answer 2", { exact: true }).fill("Tokyo");
  await page.getByRole("button", { name: "Save question" }).click();
  await page.getByRole("button", { name: "Add question" }).click();
  await page
    .getByLabel("Question type", { exact: true })
    .selectOption("problem_solving");
  await page.getByLabel("Question", { exact: true }).fill("Find 2 × 5");
  await page.getByLabel("Correct answer", { exact: true }).fill("10");
  await page.getByRole("button", { name: "Save question" }).click();
  await page.getByRole("button", { name: "Start quiz" }).click();
  await page.getByLabel("France", { exact: true }).selectOption("Paris");
  await page.getByLabel("Japan", { exact: true }).selectOption("Tokyo");
  await page.getByLabel("Find 2 × 5", { exact: true }).fill("10");
  await page.getByRole("button", { name: "Submit answers" }).click();
  await expect(
    page.getByRole("heading", { name: "Result: 2 / 2" }),
  ).toBeVisible();
  await expect(page.locator(".quiz-results")).toContainText("France → Paris");
  expect(errors).toEqual([]);
});
