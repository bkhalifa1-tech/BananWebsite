import test from "node:test";
import assert from "node:assert/strict";
import { publicAppUrl } from "../server/runtime";
import { createApp } from "../server/app";
import { openDatabase } from "../server/db";
test("Codespaces public origin is derived from trusted runtime configuration", () => {
  assert.equal(
    publicAppUrl(3000, {
      CODESPACES: "true",
      CODESPACE_NAME: "demo-space",
      GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: "app.github.dev",
    }),
    "https://demo-space-3000.app.github.dev",
  );
  assert.equal(publicAppUrl(3100, {}), "http://localhost:3100");
  assert.equal(
    publicAppUrl(3000, { CODESPACES: "true", CODESPACE_NAME: "invalid/name" }),
    "http://localhost:3000",
  );
  assert.equal(
    publicAppUrl(3000, {
      APP_URL: "https://study.example",
      CODESPACES: "true",
      CODESPACE_NAME: "demo-space",
    }),
    "https://study.example",
  );
});
test("registration behind HTTPS forwarding accepts the configured public origin and rejects spoofed origins", async () => {
  const db = openDatabase(":memory:"),
    origin = "https://demo-space-3000.app.github.dev";
  const server = createApp(db, true, {
    baseUrl: origin,
    aiProvider: null,
    mailer: { delivery: "local", async send() {} },
  }).listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const url = `http://127.0.0.1:${address.port}/api/auth/register`,
      body = JSON.stringify({
        name: "Codespace Student",
        email: "codespace@example.com",
        password: "test-password-123",
      });
    const good = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Study-Client": "web",
        origin,
      },
      body,
    });
    assert.equal(good.status, 201);
    assert.match(good.headers.get("set-cookie")!, /Secure/);
    const bad = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Study-Client": "web",
        origin: "https://foreign.example",
        "X-Forwarded-Host": "foreign.example",
        "X-Forwarded-Proto": "https",
      },
      body,
    });
    assert.equal(bad.status, 403);
  } finally {
    await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
    db.close();
  }
});
