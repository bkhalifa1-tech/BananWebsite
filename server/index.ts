import { createServer as createHttpServer } from "node:http";
import { existsSync } from "node:fs";
import express from "express";
import { resolve } from "node:path";
import { createApp } from "./app";
import { openDatabase } from "./db";
if (existsSync(".env")) process.loadEnvFile(".env");
const production = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT ?? 3000);
const app = createApp(
  openDatabase(process.env.DATABASE_PATH ?? ".data/study.sqlite"),
  production || process.env.COOKIE_SECURE === "true",
);
const httpServer = createHttpServer(app);
if (production) {
  app.use(express.static(resolve("dist")));
  app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true, hmr: { server: httpServer } },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
httpServer.listen(port, "0.0.0.0", () =>
  console.log(`Study OS listening on port ${port}`),
);
