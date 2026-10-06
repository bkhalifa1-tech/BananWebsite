import test from "node:test";
import assert from "node:assert/strict";
import { retrieveStudyText } from "../server/ai/retrieval";
import { testServer, pdfFixture } from "./helpers";
test("lexical retrieval keeps matching page labels and bounded passages", () => {
  const text = Array.from(
    { length: 20 },
    (_, i) =>
      `[Page ${i + 1}] ` +
      (i === 15 ? "Normalization uses keys." : "Unrelated astronomy.").repeat(
        100,
      ),
  ).join("\n");
  const r = retrieveStudyText(text, "Normalization", 6000);
  assert.match(r.text, /\[Page 16\]/);
  assert.equal(r.matched, true);
  assert(r.text.length <= 6000);
  assert(r.truncated);
});
test("PDF indexing and workspace retrieval use owned sources only", async () => {
  let prompt = "";
  const s = await testServer({
    async complete(m) {
      prompt = m.at(-1)!.content;
      return "Source answer";
    },
  });
  try {
    const u = await s.register("index@example.com"),
      o = await s.register("index-other@example.com"),
      c = await s.course(u),
      f = new FormData();
    f.append(
      "file",
      new Blob([pdfFixture()], { type: "application/pdf" }),
      "lecture.pdf",
    );
    const m = await (
      await s.request(`/courses/${c.id}/materials`, "POST", f, u)
    ).json();
    assert.equal(
      (
        await s.request(
          `/courses/${c.id}/index-material/${m.id}`,
          "POST",
          {},
          o,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await s.request(
          `/courses/${c.id}/index-material/${m.id}`,
          "POST",
          {},
          u,
        )
      ).status,
      200,
    );
    const hits = await (
      await s.request(
        `/courses/${c.id}/search-study?q=lecture`,
        "GET",
        undefined,
        u,
      )
    ).json();
    assert.equal(hits[0].id, m.id);
    const result = await s.request(
      `/courses/${c.id}/ai`,
      "POST",
      {
        action: "chat",
        language: "en",
        prompt: "Explain lecture",
        source: { kind: "workspace", id: c.id },
      },
      u,
    );
    assert.equal(result.status, 200);
    assert.match(prompt, /lecture.pdf/);
    assert.match(prompt, /\[Page 1\]/);
  } finally {
    await s.close();
  }
});
test("long translations commit chunks, resume provider failure and isolate originals/results", async () => {
  let fail = true,
    count = 0;
  const s = await testServer({
    async complete() {
      if (++count === 2 && fail) throw new Error("provider interrupted");
      return "Translated chunk";
    },
  });
  try {
    const u = await s.register("translate@example.com"),
      o = await s.register("translate-other@example.com"),
      c = await s.course(u),
      n = await (
        await s.request(
          `/courses/${c.id}/notes`,
          "POST",
          {
            title: "Long source",
            html: "<p>" + "Study ".repeat(1500) + "</p>",
          },
          u,
        )
      ).json();
    const start = await s.request(
      `/courses/${c.id}/translations`,
      "POST",
      { kind: "note", source_id: n.id, target: "ar" },
      u,
    );
    assert.equal(start.status, 202);
    const id = (await start.json()).id;
    let job;
    for (let i = 0; i < 50; i++) {
      job = await (
        await s.request(`/translations/${id}`, "GET", undefined, u)
      ).json();
      if (job.state !== "running") break;
      await new Promise((r) => setTimeout(r, 10));
    }
    assert.equal(job.state, "failed");
    assert.equal(job.cursor, 6000);
    assert.equal(
      (await s.request(`/translations/${id}`, "GET", undefined, o)).status,
      404,
    );
    fail = false;
    assert.equal(
      (await s.request(`/translations/${id}/retry`, "POST", {}, u)).status,
      202,
    );
    for (let i = 0; i < 50; i++) {
      job = await (
        await s.request(`/translations/${id}`, "GET", undefined, u)
      ).json();
      if (job.state === "completed") break;
      await new Promise((r) => setTimeout(r, 10));
    }
    assert.equal(job.state, "completed");
    assert.equal(job.result.trim().split("\n\n").length, 2);
  } finally {
    await s.close();
  }
});
