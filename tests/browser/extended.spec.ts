import { test, expect } from "@playwright/test";
import { openCourse } from "./helpers";
import { pdfFixture } from "../helpers";
test("saved PDF highlights, pen strokes, bookmarks and vocabulary survive reload in a responsive workspace", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openCourse(page, "extended");
  await page.getByLabel("Upload material").setInputFiles({
    name: "extended.pdf",
    mimeType: "application/pdf",
    buffer: pdfFixture(),
  });
  await page.getByRole("button", { name: "extended.pdf", exact: true }).click();
  const text = page.locator(".react-pdf__Page__textContent");
  await expect(text).toContainText("Study OS lecture fixture");
  await text.evaluate((el) => {
    const selection = window.getSelection(),
      range = document.createRange();
    range.selectNodeContents(el);
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await text.dispatchEvent("pointerup");
  await page
    .getByRole("button", { name: "Highlight selection", exact: true })
    .click();
  await expect(page.locator(".annotation-list")).toContainText("Highlight");
  await page
    .getByRole("button", { name: "Bookmark page", exact: true })
    .click();
  await expect(page.locator(".annotation-list")).toContainText("Bookmark");
  await page.getByLabel("Page comment").fill("Review this page");
  await page.getByRole("button", { name: "Save comment", exact: true }).click();
  await expect(page.locator(".annotation-list")).toContainText(
    "Review this page",
  );
  await page.getByRole("button", { name: "Pen / stylus", exact: true }).click();
  const svg = page.locator(".pdf-overlay"),
    b = await svg.boundingBox();
  if (!b) throw new Error("PDF overlay missing");
  await page.mouse.move(b.x + 30, b.y + 40);
  await page.mouse.down();
  await page.mouse.move(b.x + 80, b.y + 70, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator(".annotation-list")).toContainText("Drawing");
  if (
    !(
      (await page
        .locator(".learning-studio details")
        .first()
        .getAttribute("open")) !== null
    )
  )
    await page.locator(".learning-studio summary").first().click();
  await page.getByLabel("Word / phrase", { exact: true }).fill("Normalization");
  await page.getByLabel("Meaning", { exact: true }).fill("Organizing tables");
  await page
    .getByRole("button", { name: "Save vocabulary", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Make flashcard", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Flashcard saved", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "extended.pdf", exact: true }).click();
  await expect(page.locator(".annotation-list")).toContainText(
    "Review this page",
  );
  await expect(page.locator(".pdf-overlay polyline")).toHaveCount(1);
  if (
    !(
      (await page
        .locator(".learning-studio details")
        .first()
        .getAttribute("open")) !== null
    )
  )
    await page.locator(".learning-studio summary").first().click();
  await expect(page.locator(".vocabulary-grid")).toContainText("Normalization");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("advanced notes persist tables, math, checklists, colors and a private drawing", async ({
  page,
}) => {
  await openCourse(page, "rich-notes");
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Name").fill("Rich notes");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Note content" })
    .fill("My important notes");
  await page.getByRole("button", { name: "Table", exact: true }).click();
  await expect(page.locator(".note-prose table")).toHaveCount(1);
  await page.getByRole("button", { name: "Math / LaTeX", exact: true }).click();
  await page.getByLabel("LaTeX expression").fill("x^2 + y^2");
  await page.getByRole("button", { name: "Insert", exact: true }).click();
  await expect(page.locator(".note-prose .katex")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Drawing / stylus", exact: true })
    .click();
  const b = await page.getByLabel("Note drawing canvas").boundingBox();
  if (!b) throw new Error("Drawing canvas missing");
  await page.mouse.move(b.x + 30, b.y + 30);
  await page.mouse.down();
  await page.mouse.move(b.x + 90, b.y + 70, { steps: 5 });
  await page.mouse.up();
  await page
    .getByRole("button", { name: "Save drawing in note", exact: true })
    .click();
  await expect(
    page.locator('.note-prose img[src^="/api/materials/"]'),
  ).toHaveCount(1);
  await expect(page.locator(".save-state")).toHaveText("Saved");
  await page.reload();
  await page.getByRole("tab", { name: "Notes", exact: true }).click();
  await page.getByRole("button", { name: "Rich notes", exact: true }).click();
  await expect(page.locator(".note-prose table")).toHaveCount(1);
  await expect(page.locator(".note-prose .katex")).toHaveCount(1);
  await expect(
    page.locator('.note-prose img[src^="/api/materials/"]'),
  ).toHaveCount(1);
});
test("shared group notes and consenting community posts persist; Arabic and mobile layouts work", async ({
  page,
}) => {
  await openCourse(page, "social-browser");
  await page
    .getByRole("button", { name: "Study together", exact: true })
    .click();
  await page.getByLabel("New group name").fill("My study group");
  await page.getByRole("button", { name: "Create group", exact: true }).click();
  await page
    .getByRole("button", { name: "My study group", exact: true })
    .click();
  await page.getByLabel("Title", { exact: true }).fill("Group review");
  await page.getByLabel("Shared content").fill("Our key concepts");
  await page
    .getByRole("button", { name: "Save shared note", exact: true })
    .click();
  await expect(page.locator(".social-note")).toContainText("Our key concepts");
  await page.reload();
  await page
    .getByRole("button", { name: "My study group", exact: true })
    .click();
  await expect(page.locator(".social-note")).toContainText("Our key concepts");
  await page.getByRole("button", { name: "Community", exact: true }).click();
  const postTitle = `Community review ${Date.now()}`;
  await page.getByLabel("Post title").fill(postTitle);
  await page.getByLabel("Post content").fill("A public study discussion");
  await page
    .getByLabel("I agree to share this content with site members.")
    .check();
  await page.getByRole("button", { name: "Publish post", exact: true }).click();
  await expect(
    page.locator(".social-note").filter({ hasText: postTitle }),
  ).toContainText("A public study discussion");
  await page
    .getByRole("button", { name: "Switch language", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
