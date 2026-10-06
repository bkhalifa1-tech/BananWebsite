import test from "node:test";
import assert from "node:assert/strict";
import { testServer } from "./helpers";
test("group invitations bind to recipient; viewers cannot edit and revoked members lose access; edits reject stale versions", async () => {
  const s = await testServer();
  try {
    const u = await s.register("group-owner@example.com"),
      v = await s.register("group-viewer@example.com"),
      e = await s.register("group-editor@example.com");
    const g = await (
      await s.request("/groups", "POST", { name: "Study group" }, u)
    ).json();
    const n = await (
      await s.request(
        `/groups/${g.id}/notes`,
        "POST",
        { title: "Shared keys", body: "Keys identify rows." },
        u,
      )
    ).json();
    assert.equal(
      (await s.request(`/groups/${g.id}`, "GET", undefined, v)).status,
      404,
    );
    await s.request(
      `/groups/${g.id}/invites`,
      "POST",
      { email: "group-viewer@example.com", role: "viewer" },
      u,
    );
    const inbox = await (
      await s.request("/social", "GET", undefined, v)
    ).json();
    assert.equal(inbox.invites.length, 1);
    assert.equal(
      (
        await s.request(
          `/group-invites/${inbox.invites[0].id}/accept`,
          "POST",
          {},
          e,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await s.request(
          `/group-invites/${inbox.invites[0].id}/accept`,
          "POST",
          {},
          v,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await s.request(
          `/groups/${g.id}/notes`,
          "POST",
          { title: "No write", body: "x" },
          v,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await s.request(
          `/groups/${g.id}/notes/${n.id}`,
          "PATCH",
          { title: "No write", body: "x", version: 1 },
          v,
        )
      ).status,
      403,
    );
    await s.request(
      `/groups/${g.id}/invites`,
      "POST",
      { email: "group-editor@example.com", role: "editor" },
      u,
    );
    const ei = await (await s.request("/social", "GET", undefined, e)).json();
    await s.request(`/group-invites/${ei.invites[0].id}/accept`, "POST", {}, e);
    const edit = {
      title: "Edited keys",
      body: "Unique identifiers.",
      version: 1,
    };
    assert.equal(
      (await s.request(`/groups/${g.id}/notes/${n.id}`, "PATCH", edit, e))
        .status,
      200,
    );
    assert.equal(
      (await s.request(`/groups/${g.id}/notes/${n.id}`, "PATCH", edit, u))
        .status,
      409,
    );
    const viewerId = s.db
      .prepare("SELECT id FROM users WHERE email='group-viewer@example.com'")
      .get()!.id;
    await s.request(
      `/groups/${g.id}/members/${viewerId}`,
      "DELETE",
      undefined,
      u,
    );
    assert.equal(
      (await s.request(`/groups/${g.id}`, "GET", undefined, v)).status,
      404,
    );
    assert.equal(
      (await s.request(`/groups/${g.id}`, "DELETE", undefined, e)).status,
      404,
    );
    await s.request(`/groups/${g.id}`, "DELETE", undefined, u);
    assert.equal(
      s.db.prepare("SELECT COUNT(*) AS n FROM group_notes").get()!.n,
      0,
    );
  } finally {
    await s.close();
  }
});
test("community requires explicit consent, protects author actions and accepts deduplicated likes and reports", async () => {
  const s = await testServer();
  try {
    const u = await s.register("community@example.com"),
      o = await s.register("community-other@example.com");
    assert.equal((await s.request("/community", "GET")).status, 401);
    assert.equal(
      (
        await s.request(
          "/community",
          "POST",
          {
            title: "Keys",
            body: "Discussion",
            topic: "Databases",
            consent: false,
          },
          u,
        )
      ).status,
      400,
    );
    const p = await (
      await s.request(
        "/community",
        "POST",
        {
          title: "Keys",
          body: "Discussion",
          topic: "Databases",
          consent: true,
        },
        u,
      )
    ).json();
    assert.equal(
      (await s.request(`/community/${p.id}`, "DELETE", undefined, o)).status,
      404,
    );
    for (let i = 0; i < 2; i++)
      await s.request(`/community/${p.id}/like`, "POST", {}, o);
    const feed = await (
      await s.request("/community", "GET", undefined, o)
    ).json();
    assert.equal(feed.posts[0].likes, 1);
    const c = await (
      await s.request(
        `/community/${p.id}/comments`,
        "POST",
        { body: "Good explanation" },
        o,
      )
    ).json();
    assert.equal(
      (await s.request(`/community-comments/${c.id}`, "DELETE", undefined, u))
        .status,
      404,
    );
    await s.request(
      `/community/${p.id}/report`,
      "POST",
      { reason: "Needs citation" },
      o,
    );
    assert.equal(
      s.db.prepare("SELECT COUNT(*) AS n FROM community_reports").get()!.n,
      1,
    );
    assert.equal(
      (await s.request("/community-reports", "GET", undefined, o)).status,
      404,
    );
    await s.request(`/community/${p.id}`, "DELETE", undefined, u);
    assert.equal(
      s.db.prepare("SELECT COUNT(*) AS n FROM community_comments").get()!.n,
      0,
    );
  } finally {
    await s.close();
  }
});
