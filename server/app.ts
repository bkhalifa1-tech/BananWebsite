import { generationRoutes } from "./ai/generation";
import { learningRoutes } from "./learning";
import { personalRoutes } from "./personal";
import { recommendationRoutes } from "./recommendations";
import { configuredAI, type AIProvider } from "./ai/provider";
import { aiRoutes } from "./ai/routes";
import { analyticsRoutes } from "./analytics";
import { practiceRoutes } from "./practice";
import { plannerRoutes } from "./planner";
import { academicRoutes } from "./academic";
import { contentRoutes } from "./content";
import { configuredMailer, type Mailer } from "./mail";
import { recoveryService, recoveryRoutes } from "./recovery";
import { studyRoutes } from "./study";
import express from "express";
import { randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { hashPassword, verifyPassword, tokenHash } from "./auth";
const preferencesSchema = z
  .object({
    theme: z
      .enum(["forest", "ocean", "lavender", "rose", "ember", "midnight"])
      .optional(),
    mode: z.enum(["light", "dark", "system"]).optional(),
    language: z.enum(["ar", "en"]).optional(),
    track: z.enum(["semester", "personal"]).optional(),
    onboarded: z.boolean().optional(),
  })
  .strict();
const credentials = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((s) => s.toLowerCase()),
  password: z.string().min(10).max(128),
});
type UserRow = {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  email_verified?: number;
};
export function createApp(
  db: DatabaseSync,
  secure = false,
  options: {
    mailer?: Mailer;
    aiProvider?: AIProvider | null;
    baseUrl?: string;
    requireVerified?: boolean;
  } = {},
) {
  const production = process.env.NODE_ENV === "production";
  const mailer = options.mailer ?? configuredMailer(production);
  const baseUrl =
    options.baseUrl ?? process.env.APP_URL ?? "http://localhost:3000";
  if (
    production &&
    mailer.delivery === "email" &&
    (!process.env.APP_URL || !process.env.APP_URL.startsWith("https://"))
  )
    throw new Error("Production email requires a trusted HTTPS APP_URL.");
  const recovery = recoveryService(db, mailer, baseUrl);
  const app = express();
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      "X-Frame-Options": "DENY",
    });
    next();
  });
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "256kb" }));
  app.use("/api", (req, res, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.get("origin");
      let validOrigin = true;
      try {
        if (origin)
          validOrigin =
            new URL(origin).origin === new URL(baseUrl).origin ||
            new URL(origin).origin ===
              `${secure ? "https" : "http"}://${req.get("host")}`;
      } catch {
        validOrigin = false;
      }
      if (req.get("x-study-client") !== "web" || !validOrigin) {
        res.status(403).json({ error: "Invalid request origin." });
        return;
      }
    }
    next();
  });
  const attempts = new Map<string, { count: number; until: number }>();
  app.use("/api/auth", (req, res, next) => {
    if (req.method !== "POST") {
      next();
      return;
    }
    const now = Date.now();
    for (const [key, value] of attempts)
      if (value.until < now) attempts.delete(key);
    const key = req.ip ?? "unknown";
    const entry = attempts.get(key) ?? {
      count: 0,
      until: now + 15 * 60 * 1000,
    };
    attempts.set(key, entry);
    entry.count++;
    if (entry.count > 30) {
      res.set("Retry-After", String(Math.ceil((entry.until - now) / 1000)));
      res
        .status(429)
        .json({ error: "Too many attempts. Try again in 15 minutes." });
      return;
    }
    next();
  });
  function userFor(req: express.Request) {
    const token = req.headers.cookie
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("study_session="))
      ?.slice(14);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return undefined;
    return db
      .prepare(
        "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?",
      )
      .get(tokenHash(token), Date.now()) as UserRow | undefined;
  }
  function payload(user: UserRow) {
    const p = db
      .prepare(
        "SELECT theme,mode,language,track,onboarded FROM preferences WHERE user_id=?",
      )
      .get(user.id)!;
    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: Boolean(user.email_verified),
      },
      emailDelivery: mailer.delivery,
      preferences: { ...p, onboarded: Boolean(p.onboarded) },
    };
  }
  function session(res: express.Response, id: string) {
    const token = randomBytes(32).toString("hex");
    db.prepare("DELETE FROM sessions WHERE expires_at<=?").run(Date.now());
    db.prepare("INSERT INTO sessions VALUES (?,?,?)").run(
      tokenHash(token),
      id,
      Date.now() + 7 * 86400000,
    );
    res.cookie("study_session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 7 * 86400000,
    });
  }
  app.get("/api/health", (_req, res) => {
    db.prepare("SELECT 1").get();
    res.json({ status: "ok", emailDelivery: mailer.delivery });
  });
  app.get("/api/me", (req, res) => {
    const user = userFor(req);
    if (!user) {
      res.status(401).json({ error: "Sign in required." });
      return;
    }
    res.json(payload(user));
  });
  app.post("/api/auth/register", async (req, res) => {
    if (mailer.delivery === "unavailable") {
      res.status(503).json({ error: "Email delivery is not configured." });
      return;
    }
    const result = credentials
      .extend({ name: z.string().trim().min(2).max(60) })
      .safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error:
          "Enter a name, valid email, and a password of 10–128 characters.",
      });
      return;
    }
    const { email, password, name } = result.data;
    if (db.prepare("SELECT id FROM users WHERE email=?").get(email)) {
      res.status(409).json({ error: "This email is already registered." });
      return;
    }
    const id = randomUUID();
    const hash = hashPassword(password);
    db.exec("BEGIN");
    try {
      db.prepare(
        "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,?)",
      ).run(id, email, name, hash);
      db.prepare("INSERT INTO preferences(user_id) VALUES(?)").run(id);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    session(res, id);
    const user = { id, email, name, password_hash: hash, email_verified: 0 };
    let verificationSent = false;
    try {
      verificationSent = await recovery.issue(user, "verify");
    } catch {
      /* Account remains usable; verification can be retried from settings. */
    }
    res.status(201).json({ ...payload(user), verificationSent });
  });
  app.post("/api/auth/login", (req, res) => {
    const result = credentials.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Enter a valid email and password." });
      return;
    }
    const user = db
      .prepare("SELECT * FROM users WHERE email=?")
      .get(result.data.email) as UserRow | undefined;
    const hash =
      user?.password_hash ?? hashPassword("invalid-account-password");
    const valid = verifyPassword(result.data.password, hash);
    if (!user || !valid) {
      res.status(401).json({ error: "Email or password is incorrect." });
      return;
    }
    session(res, user.id);
    res.json(payload(user));
  });
  app.post("/api/auth/logout", (req, res) => {
    const token = req.headers.cookie
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("study_session="))
      ?.slice(14);
    if (token)
      db.prepare("DELETE FROM sessions WHERE token_hash=?").run(
        tokenHash(token),
      );
    res.clearCookie("study_session", {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
    });
    res.status(204).end();
  });
  app.patch("/api/preferences", (req, res) => {
    const user = userFor(req);
    if (!user) {
      res.status(401).json({ error: "Sign in required." });
      return;
    }
    const result = preferencesSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Invalid preferences." });
      return;
    }
    for (const [key, value] of Object.entries(result.data))
      db.prepare(`UPDATE preferences SET ${key}=? WHERE user_id=?`).run(
        typeof value === "boolean" ? Number(value) : value,
        user.id,
      );
    res.json(payload(user));
  });
  recoveryRoutes(app, db, userFor, mailer, recovery);
  app.use(
    "/api",
    personalRoutes(db, userFor, options.requireVerified ?? production),
  );
  app.use(
    "/api",
    recommendationRoutes(db, userFor, options.requireVerified ?? production),
  );
  app.use(
    "/api",
    aiRoutes(
      db,
      userFor,
      options.aiProvider === undefined ? configuredAI() : options.aiProvider,
      options.requireVerified ?? production,
    ),
  );
  app.use(
    "/api",
    analyticsRoutes(db, userFor, options.requireVerified ?? production),
  );
  app.use(
    "/api",
    practiceRoutes(db, userFor, options.requireVerified ?? production),
  );
  app.use(
    "/api",
    plannerRoutes(db, userFor, options.requireVerified ?? production),
  );
  app.use(
    "/api",
    academicRoutes(db, userFor, options.requireVerified ?? production),
  );
  app.use(
    "/api",
    contentRoutes(db, userFor, options.requireVerified ?? production),
  );
  app.use(
    "/api",
    studyRoutes(db, userFor, options.requireVerified ?? production),
  );
  app.use("/api",generationRoutes(db,userFor,options.requireVerified ?? production));
  app.use("/api",learningRoutes(db,userFor,options.requireVerified ?? production));
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Endpoint not found." });
  });
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      void _next;
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        String(err.code).startsWith("LIMIT_")
      ) {
        res.status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
          error:
            err.code === "LIMIT_FILE_SIZE"
              ? "Files must be 10 MB or smaller."
              : "Invalid upload.",
        });
        return;
      }
      if (
        err &&
        typeof err === "object" &&
        "type" in err &&
        err.type === "entity.too.large"
      ) {
        res.status(413).json({ error: "Request is too large." });
        return;
      }
      const malformed = err instanceof SyntaxError;
      res.status(malformed ? 400 : 500).json({
        error: malformed
          ? "Invalid request body."
          : "Something went wrong. Please try again.",
      });
    },
  );
  return app;
}
