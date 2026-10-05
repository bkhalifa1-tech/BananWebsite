import test from "node:test";
import assert from "node:assert/strict";
import { testServer, pdfFixture } from "./helpers";
import { extractPdf } from "../server/ai/sources";
import type { AIMessage } from "../server/ai/provider";
test("PDF parsing runs in a worker and extracts real text", async () => {
  const result = await extractPdf(pdfFixture());
  assert.match(result.text, /Study OS lecture fixture/);
  assert.equal(result.pages, 1);
  assert.equal(result.truncated, false);
});
test("AI layer isolates sources/conversations, persists history and remains disabled without provider", async () => {
  const requests: AIMessage[][] = [];
  const s = await testServer({
    async complete(messages) {
      requests.push(messages);
      return "Test provider response";
    },
  });
  try {
    const u = await s.register("ai@example.com"),
      o = await s.register("ai-other@example.com"),
      c = await s.course(u),
      other = await s.course(o);
    const note = await (
      await s.request(
        `/courses/${c.id}/notes`,
        "POST",
        { title: "Keys", html: "<p>A key uniquely identifies a row.</p>" },
        u,
      )
    ).json();
    const request = {
      action: "summarize",
      language: "en",
      source: { kind: "note", id: note.id },
    };
    assert.equal(
      (await s.request(`/courses/${other.id}/ai`, "POST", request, o)).status,
      404,
    );
    assert.equal(requests.length, 0);
    const r = await s.request(`/courses/${c.id}/ai`, "POST", request, u);
    assert.equal(r.status, 200);
    const result = await r.json();
    assert.match(requests[0].at(-1)!.content, /key uniquely identifies/);
    assert.equal(
      (
        await s.request(
          `/conversations/${result.conversation_id}`,
          "GET",
          undefined,
          o,
        )
      ).status,
      404,
    );
    const conversation = await (
      await s.request(
        `/conversations/${result.conversation_id}`,
        "GET",
        undefined,
        u,
      )
    ).json();
    assert.equal(conversation.messages.length, 2);
    assert.equal(conversation.messages[1].content, "Test provider response");
    await s.request(
      `/courses/${c.id}/ai`,
      "POST",
      {
        action: "chat",
        prompt: "Explain more",
        language: "en",
        conversation_id: result.conversation_id,
      },
      u,
    );
    assert.equal(requests[1].filter((m) => m.role === "assistant").length, 1);
    assert.equal(
      (
        await s.request(
          `/conversations/${result.conversation_id}`,
          "DELETE",
          undefined,
          o,
        )
      ).status,
      404,
    );
  } finally {
    await s.close();
  }
  const disabled = await testServer();
  try {
    const u = await disabled.register("no-ai@example.com"),
      c = await disabled.course(u);
    assert.equal(
      (
        await disabled
          .request(`/courses/${c.id}/ai`, "GET", undefined, u)
          .then((r) => r.json())
      ).enabled,
      false,
    );
    assert.equal(
      (
        await disabled.request(
          `/courses/${c.id}/ai`,
          "POST",
          { action: "chat", prompt: "Hello", language: "en" },
          u,
        )
      ).status,
      503,
    );
  } finally {
    await disabled.close();
  }
});
