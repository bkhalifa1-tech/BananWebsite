import type { AIProvider } from "../server/ai/provider";
import assert from "node:assert/strict";
import { createApp } from "../server/app";
import { openDatabase } from "../server/db";
export async function testServer(aiProvider: AIProvider | null = null) {
  const db = openDatabase(":memory:");
  const server = createApp(db, false, {
    aiProvider,
    mailer: { delivery: "local", async send() {} },
    baseUrl: "http://localhost:3000",
  }).listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const address = server.address();
  assert(address && typeof address === "object");
  const port = address.port;
  async function request(
    path: string,
    method = "GET",
    body?: unknown,
    cookie = "",
  ) {
    const multipart = body instanceof FormData;
    return fetch(`http://127.0.0.1:${port}/api${path}`, {
      method,
      headers: {
        "X-Study-Client": "web",
        cookie,
        ...(!multipart ? { "Content-Type": "application/json" } : {}),
      },
      body:
        body === undefined
          ? undefined
          : multipart
            ? body
            : JSON.stringify(body),
    });
  }
  async function register(email: string) {
    const response = await request("/auth/register", "POST", {
      name: "Test Student",
      email,
      password: "a-test-password-123",
    });
    assert.equal(response.status, 201);
    return response.headers.get("set-cookie")!.split(";")[0];
  }
  async function course(cookie: string) {
    const s = await (
      await request(
        "/semesters",
        "POST",
        {
          name: "Test Semester",
          start_date: "2026-09-01",
          end_date: "2027-06-01",
        },
        cookie,
      )
    ).json();
    return (
      await request(
        `/semesters/${s.id}/courses`,
        "POST",
        { name: "Test Course", code: "CS100", credits: 3, color: "#216348" },
        cookie,
      )
    ).json();
  }
  return {
    db,
    request,
    register,
    course,
    async close() {
      await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
      db.close();
    },
  };
}
export function pdfFixture() {
  const content = "BT /F1 16 Tf 30 150 Td (Study OS lecture fixture) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
      .join("") +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}
