import { test, expect } from "@playwright/test";
import { openCourse } from "./helpers";
test("recommendations use actual tasks and open a prefilled focus session", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openCourse(page, "recommend");
  const id = new URL(page.url()).hash.split("/").at(-1);
  const r = await page.request.post(`/api/courses/${id}/tasks`, {
    headers: { "X-Study-Client": "web" },
    data: { title: "Review normalization", due_date: "2026-10-05" },
  });
  expect(r.status()).toBe(201);
  await page.reload();
  await expect(page.locator(".recommendations-card")).toContainText(
    "Review normalization",
  );
  await page
    .getByRole("link", { name: "Start recommended session", exact: true })
    .click();
  await expect(page.getByLabel("Study topic")).toHaveValue(
    "Review normalization",
  );
  await expect(page.getByLabel("Study minutes")).toHaveValue("30");
  await page.getByRole("button", { name: "Start focus", exact: true }).click();
  await expect(page.getByRole("timer")).toBeVisible();
  await page.getByRole("button", { name: "Finish & save" }).click();
  expect(errors).toEqual([]);
});
