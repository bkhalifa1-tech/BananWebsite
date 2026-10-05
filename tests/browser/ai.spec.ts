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
  const requests: AIMessage[][] = [];
  const db = openDatabase(":memory:");
  const app = createApp(db, false, {
    mailer: { delivery: "local", async send() {} },
    requireVerified: false,
    aiProvider: {
      async complete(messages) {
        requests.push(messages);
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
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
    db.close();
  }
});
