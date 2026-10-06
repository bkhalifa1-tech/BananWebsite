import test from "node:test";
import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import { inspectFile } from "../server/file-formats";
import { testServer } from "./helpers";
test("Office extraction uses bounded archives and rejects macros, invalid containers and oversize XML", async () => {
  const doc = Buffer.from(
    zipSync({
      "[Content_Types].xml": strToU8(
        "<Types>wordprocessingml.document.main+xml</Types>",
      ),
      "word/document.xml": strToU8(
        "<w:document><w:t>Study &amp; learn</w:t></w:document>",
      ),
    }),
  );
  const extracted = await inspectFile(doc, "lecture.docx");
  assert.match(extracted!.mime, /wordprocessing/);
  assert.match(extracted!.text, /Study & learn/);
  const ppt = Buffer.from(
    zipSync({
      "[Content_Types].xml": strToU8(
        "<Types>presentationml.presentation.main+xml</Types>",
      ),
      "ppt/slides/slide2.xml": strToU8("<a:t>Second</a:t>"),
      "ppt/slides/slide1.xml": strToU8("<a:t>First</a:t>"),
    }),
  );
  assert.match(
    (await inspectFile(ppt, "lecture.pptx"))!.text,
    /First[\s\S]*Second/,
  );
  const bad = Buffer.from(
    zipSync({
      "[Content_Types].xml": strToU8("macroEnabled"),
      "word/document.xml": strToU8("<w:t>unsafe</w:t>"),
    }),
  );
  await assert.rejects(inspectFile(bad, "unsafe.docx"));
  const huge = Buffer.from(
    zipSync({
      "[Content_Types].xml": strToU8("wordprocessingml.document.main+xml"),
      "word/document.xml": new Uint8Array(2_000_001),
    }),
  );
  await assert.rejects(inspectFile(huge, "bomb.docx"));
  assert.equal(
    await inspectFile(Buffer.from("not a media file"), "audio.mp3"),
    null,
  );
});
test("private media uploads support ranges; transcription and generated audio are gated, persist and isolate owners", async () => {
  let calls = 0;
  const s = await testServer({
    async complete() {
      return "Unused";
    },
    async transcribe() {
      calls++;
      return "A lecture about primary keys.";
    },
    async readImage() {
      calls++;
      return "Text read from a study image.";
    },
    async speak() {
      calls++;
      return new Uint8Array([73, 68, 51, 0, 1, 2]);
    },
  });
  try {
    const u = await s.register("media@example.com"),
      o = await s.register("media-other@example.com"),
      c = await s.course(u),
      f = new FormData();
    f.append(
      "file",
      new Blob([Buffer.from("ID3recording")], { type: "audio/mpeg" }),
      "lecture.mp3",
    );
    const m = await (
      await s.request(`/courses/${c.id}/materials`, "POST", f, u)
    ).json();
    assert.equal(m.mime, "audio/mpeg");
    const range = await s.request(
      `/materials/${m.id}/file`,
      "GET",
      undefined,
      u,
      { Range: "bytes=0-2" },
    );
    assert.equal(range.status, 206);
    assert.equal(await range.text(), "ID3");
    assert.equal(
      (
        await s.request(`/materials/${m.id}/file`, "GET", undefined, u, {
          Range: "bytes=9999-",
        })
      ).status,
      416,
    );
    const image = new FormData();
    image.append(
      "file",
      new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0])], {
        type: "image/png",
      }),
      "study.png",
    );
    const img = await (
      await s.request(`/courses/${c.id}/materials`, "POST", image, u)
    ).json();
    assert.equal(
      (
        await s.request(
          `/courses/${c.id}/media`,
          "POST",
          { action: "ocr", material_id: img.id },
          o,
        )
      ).status,
      404,
    );
    const ocr = await (
      await s.request(
        `/courses/${c.id}/media`,
        "POST",
        { action: "ocr", material_id: img.id },
        u,
      )
    ).json();
    assert.match(ocr.text, /study image/);
    assert.equal(
      (
        await s.request(
          `/courses/${c.id}/media`,
          "POST",
          { action: "transcribe", material_id: m.id },
          o,
        )
      ).status,
      404,
    );
    assert.equal(calls, 1);
    assert.equal(
      (
        await s.request(
          `/courses/${c.id}/media`,
          "POST",
          { action: "transcribe", material_id: m.id },
          u,
        )
      ).status,
      200,
    );
    const text = await (
      await s.request(`/materials/${m.id}/text`, "GET", undefined, u)
    ).json();
    assert.match(text.text, /primary keys/);
    const sources = await (
      await s.request(`/courses/${c.id}/ai`, "GET", undefined, u)
    ).json();
    assert(
      sources.sources.some((v: { kind: string }) => v.kind === "document"),
    );
    const a = await (
      await s.request(
        `/courses/${c.id}/media`,
        "POST",
        {
          action: "speech",
          title: "Key summary",
          text: "A primary key identifies a row.",
          language: "en",
        },
        u,
      )
    ).json();
    assert(a.id);
    assert.equal(
      (await s.request(`/generated-audio/${a.id}/file`, "GET", undefined, o))
        .status,
      404,
    );
    const audio = await s.request(
      `/generated-audio/${a.id}/file`,
      "GET",
      undefined,
      u,
    );
    assert.equal(audio.status, 200);
    assert.equal(audio.headers.get("content-type"), "audio/mpeg");
    await s.request(`/courses/${c.id}`, "DELETE", undefined, u);
    assert.equal(
      s.db.prepare("SELECT COUNT(*) AS n FROM generated_audio").get()!.n,
      0,
    );
  } finally {
    await s.close();
  }
});
