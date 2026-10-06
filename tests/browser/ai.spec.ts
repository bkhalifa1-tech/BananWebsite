import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import express from "express";
import { resolve } from "node:path";
import { createApp } from "../../server/app";
import { openDatabase } from "../../server/db";
import { pdfFixture } from "../helpers";
import { openCourse } from "./helpers";
import type { AIMessage } from "../../server/ai/provider";
test("AI browser workflow uses real private PDF extraction and an explicit controlled provider", async ({
  browser,
}) => {
  test.setTimeout(60000);
  const requests: AIMessage[][] = [];
  const db = openDatabase(":memory:");
  const app = createApp(db, false, {
    mailer: { delivery: "local", async send() {} },
    requireVerified: false,
    aiProvider: {
      async speak() {
        return readFileSync(resolve("tests/fixtures/study-tone.mp3"));
      },
      async complete(messages) {
        requests.push(messages);
        if (messages.at(-1)!.content.includes('"kind":"flashcards"'))
          return JSON.stringify({
            kind: "flashcards",
            title: "Generated deck",
            cards: [
              {
                front: "What is a lecture?",
                back: "A study source",
                topic: "Learning",
              },
            ],
          });
        return "Controlled provider summary from the uploaded PDF.";
      },
    },
  });
  app.use(express.static(resolve("dist")));
  app.get("/{*path}", (_q, res) => res.sendFile(resolve("dist/index.html")));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Test server did not bind.");
  const context = await browser.newContext({
    baseURL: `http://127.0.0.1:${address.port}`,
  });
  try {
    const page = await context.newPage(),
      errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await openCourse(page, "ai-browser");
    await page.getByLabel("Upload material").setInputFiles({
      name: "tutor.pdf",
      mimeType: "application/pdf",
      buffer: pdfFixture(),
    });
    await expect(
      page.getByRole("heading", { name: "AI study tutor", exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Study source", { exact: true })
      .selectOption({ label: "tutor.pdf" });
    await page.getByLabel("Action", { exact: true }).selectOption("summarize");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.locator(".tutor-message.assistant")).toContainText(
      "Controlled provider summary",
    );
    expect(requests).toHaveLength(1);
    expect(requests[0].at(-1)!.content).toContain("Study OS lecture fixture");
    await page.reload();
    await page
      .getByRole("button", { name: "summarize: tutor.pdf", exact: true })
      .click();
    await expect(page.locator(".tutor-message.assistant")).toContainText(
      "Controlled provider summary",
    );
    page.once("dialog", (d) => void d.accept());
    await page
      .getByRole("button", { name: "Delete conversation", exact: true })
      .click();
    await expect(page.locator(".tutor-message")).toHaveCount(0);
    await page.locator(".learning-studio summary").first().click();
    await page
      .getByLabel("Source", { exact: true })
      .selectOption({ label: "tutor.pdf" });
    await page
      .getByLabel("Study action", { exact: true })
      .selectOption("flashcards");
    await page
      .getByRole("button", { name: "Create / translate", exact: true })
      .click();
    await expect(page.locator(".generated-draft")).toContainText(
      "What is a lecture?",
    );
    await page
      .getByRole("button", { name: "Approve and add to practice", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Added to practice", exact: true }),
    ).toBeVisible();
    expect(db.prepare("SELECT COUNT(*) AS n FROM flashcards").get()!.n).toBe(1);
    await page
      .getByLabel("Study action", { exact: true })
      .selectOption("translate");
    await page
      .getByRole("button", { name: "Create / translate", exact: true })
      .click();
    await expect(
      page.locator(".study-output").filter({ hasText: "Result" }),
    ).toContainText("Controlled provider summary");
    await page
      .getByRole("button", {
        name: "Create narrated audio (up to 4,000 characters)",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", { name: "Generated study audio", exact: true }),
    ).toBeVisible();
    await page.getByLabel("Duration (seconds)", { exact: true }).fill("5");
    await page
      .getByRole("button", { name: "Export narrated study video", exact: true })
      .click();
    await expect(
      page.getByRole("link", { name: "Download video", exact: true }),
    ).toBeVisible({ timeout: 15000 });
    const downloading = page.waitForEvent("download");
    await page
      .getByRole("link", { name: "Download video", exact: true })
      .click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe("study-video.webm");
    const path = await download.path();
    expect(path).toBeTruthy();
    const video = readFileSync(path!);
    expect(video.length).toBeGreaterThan(1000);
    expect([...video.subarray(0, 4)]).toEqual([26, 69, 223, 163]);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
    db.close();
  }
});
