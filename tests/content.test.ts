import { test } from "node:test";
import assert from "node:assert/strict";
import { testServer, pdfFixture } from "./helpers";
import {
  NoteAutosave,
  type NoteRecord,
} from "../src/features/content/NoteAutosave";
test("private uploads, folder ownership, safe notes, optimistic versioning and course cascade", async () => {
  const f = await testServer();
  try {
    const a = await f.register("content-a@example.com"),
      b = await f.register("content-b@example.com"),
      c = await f.course(a),
      other = await f.course(b);
    const folder = await (
      await f.request(
        `/courses/${c.id}/folders`,
        "POST",
        { name: "Lecture 1" },
        a,
      )
    ).json();
    const foreign = await (
      await f.request(
        `/courses/${other.id}/folders`,
        "POST",
        { name: "Other folder" },
        b,
      )
    ).json();
    const upload = (bytes: Uint8Array, name: string, folderId?: string) => {
      const form = new FormData();
      form.append(
        "file",
        new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
        name,
      );
      if (folderId) form.append("folder_id", folderId);
      return form;
    };
    assert.equal(
      (
        await f.request(
          `/courses/${c.id}/materials`,
          "POST",
          upload(pdfFixture(), "lecture.pdf"),
          b,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await f.request(
          `/courses/${c.id}/materials`,
          "POST",
          upload(pdfFixture(), "lecture.pdf", foreign.id),
          a,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await f.request(
          `/courses/${c.id}/materials`,
          "POST",
          upload(Buffer.from('<svg onload="alert(1)"></svg>'), "fake.pdf"),
          a,
        )
      ).status,
      415,
    );
    const response = await f.request(
      `/courses/${c.id}/materials`,
      "POST",
      upload(pdfFixture(), "lecture.pdf", folder.id),
      a,
    );
    assert.equal(response.status, 201);
    const material = await response.json();
    const file = await f.request(
      `/materials/${material.id}/file`,
      "GET",
      undefined,
      a,
    );
    assert.equal(file.headers.get("content-type"), "application/pdf");
    assert.equal(
      Buffer.from(await file.arrayBuffer())
        .subarray(0, 5)
        .toString(),
      "%PDF-",
    );
    assert.match(file.headers.get("content-security-policy")!, /sandbox/);
    assert.equal(
      (await f.request(`/materials/${material.id}/file`, "GET", undefined, b))
        .status,
      404,
    );
    assert.equal(
      (await f.request(`/materials/${material.id}/file`)).status,
      401,
    );
    await f.request(`/folders/${folder.id}`, "DELETE", undefined, a);
    const list = await (
      await f.request(`/courses/${c.id}/content`, "GET", undefined, a)
    ).json();
    assert.equal(list.materials[0].folder_id, null);
    assert.equal(list.materials[0].data, undefined);
    const note = await (
      await f.request(
        `/courses/${c.id}/notes`,
        "POST",
        {
          title: "Lecture notes",
          html: '<script>alert(1)</script><img src=x onerror=alert(2)><p>Safe text</p><a href="javascript:alert(3)">link</a>',
        },
        a,
      )
    ).json();
    assert(!note.html.includes("<script"));
    assert(!note.html.includes("<img"));
    assert(!note.html.includes("javascript:"));
    assert.equal(
      (await f.request(`/notes/${note.id}`, "GET", undefined, b)).status,
      404,
    );
    const changed = await f.request(
      `/notes/${note.id}`,
      "PATCH",
      {
        title: "Updated notes",
        html: "<p><strong>Important</strong></p>",
        version: 1,
      },
      a,
    );
    assert.equal(changed.status, 200);
    assert.equal((await changed.json()).version, 2);
    assert.equal(
      (
        await f.request(
          `/notes/${note.id}`,
          "PATCH",
          { title: "Stale notes", html: "<p>stale</p>", version: 1 },
          a,
        )
      ).status,
      409,
    );
    assert.equal(
      (await f.request(`/materials/${material.id}`, "DELETE", undefined, b))
        .status,
      404,
    );
    await f.request(`/courses/${c.id}`, "DELETE", undefined, a);
    assert.equal(
      f.db.prepare("SELECT COUNT(*) AS n FROM materials").get()!.n,
      0,
    );
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM notes").get()!.n, 0);
  } finally {
    await f.close();
  }
});
test("oversized uploads are rejected", async () => {
  const f = await testServer();
  try {
    const cookie = await f.register("large@example.com"),
      course = await f.course(cookie);
    const form = new FormData();
    form.append("file", new Blob([Buffer.alloc(10485761, 65)]), "large.pdf");
    assert.equal(
      (await f.request(`/courses/${course.id}/materials`, "POST", form, cookie))
        .status,
      413,
    );
  } finally {
    await f.close();
  }
});
test("autosave serializes edits made during an in-flight save", async () => {
  let release: (note: NoteRecord) => void = () => {};
  const versions: number[] = [];
  const first: NoteRecord = {
    id: "n",
    title: "Initial",
    html: "<p>one</p>",
    version: 1,
    updated_at: "",
  };
  const writer = new NoteAutosave(first, async (snapshot, version) => {
    versions.push(version);
    if (version === 1)
      return new Promise<NoteRecord>((resolve) => {
        release = resolve;
      });
    return { ...snapshot, id: "n", version: version + 1, updated_at: "" };
  });
  writer.set({ title: "Initial", html: "<p>two</p>" });
  const running = writer.flush();
  writer.set({ title: "Initial", html: "<p>three</p>" });
  release({ ...first, html: "<p>two</p>", version: 2 });
  await running;
  assert.deepEqual(versions, [1, 2]);
  assert.equal(writer.dirty, false);
});
