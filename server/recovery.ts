import type { DatabaseSync } from "node:sqlite";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { Express, Request } from "express";
import { hashPassword, tokenHash } from "./auth";
import type { Mailer } from "./mail";
export type Identity = { id: string; email: string; email_verified?: number };
export function recoveryService(
  db: DatabaseSync,
  mailer: Mailer,
  baseUrl: string,
) {
  const parsed = new URL(baseUrl);
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  )
    throw new Error("Invalid APP_URL");
  const origin = parsed.origin;
  async function issue(user: Identity, purpose: "verify" | "reset") {
    if (mailer.delivery === "unavailable")
      throw new Error("Email delivery is not configured.");
    const key = `${user.id}:${purpose}`;
    const limited = db
      .prepare("SELECT next_at FROM mail_limits WHERE key=?")
      .get(key);
    if (limited && Number(limited.next_at) > Date.now()) return false;
    db.prepare(
      "INSERT INTO mail_limits VALUES(?,?) ON CONFLICT(key) DO UPDATE SET next_at=excluded.next_at",
    ).run(key, Date.now() + 60000);
    const token = randomBytes(32).toString("hex");
    const hash = tokenHash(token);
    db.prepare(
      "DELETE FROM auth_tokens WHERE expires_at<=? OR (user_id=? AND purpose=?)",
    ).run(Date.now(), user.id, purpose);
    db.prepare("INSERT INTO auth_tokens VALUES(?,?,?,?)").run(
      hash,
      user.id,
      purpose,
      Date.now() + (purpose === "verify" ? 86400000 : 1800000),
    );
    const url = `${origin}/#/${purpose}?token=${token}`;
    try {
      await mailer.send({
        to: user.email,
        purpose,
        url,
        subject:
          purpose === "verify"
            ? "Verify your Study OS email · تأكيد بريدك"
            : "Reset your Study OS password · استعادة كلمة المرور",
        text:
          purpose === "verify"
            ? `Confirm your email / تأكيد البريد:\n${url}\nThis link expires in 24 hours. / صالح لمدة 24 ساعة.`
            : `Reset your password / استعادة كلمة المرور:\n${url}\nThis link expires in 30 minutes. Ignore this email if you did not request it. / صالح لمدة 30 دقيقة. تجاهل الرسالة إن لم تطلبها.`,
      });
    } catch {
      db.prepare("DELETE FROM auth_tokens WHERE token_hash=?").run(hash);
      throw new Error("Email delivery failed. Try again later.");
    }
    return true;
  }
  return { issue };
}
const tokenSchema = z
  .object({ token: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();
const emailSchema = z
  .object({
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((s) => s.toLowerCase()),
  })
  .strict();
export function recoveryRoutes(
  app: Express,
  db: DatabaseSync,
  userFor: (req: Request) => Identity | undefined,
  mailer: Mailer,
  service: ReturnType<typeof recoveryService>,
) {
  app.post("/api/auth/verification/request", async (req, res) => {
    const u = userFor(req);
    if (!u) {
      res.status(401).json({ error: "Sign in required." });
      return;
    }
    if (u.email_verified) {
      res.json({ message: "Email already verified." });
      return;
    }
    if (mailer.delivery === "unavailable") {
      res.status(503).json({ error: "Email delivery is not configured." });
      return;
    }
    try {
      const sent = await service.issue(u, "verify");
      if (!sent) {
        res.status(429).json({
          error: "Please wait a minute before requesting another email.",
        });
        return;
      }
      res.json({
        message: "Verification email prepared.",
        delivery: mailer.delivery,
      });
    } catch {
      res
        .status(503)
        .json({ error: "Email delivery failed. Try again later." });
    }
  });
  app.post("/api/auth/verify", (req, res) => {
    const p = tokenSchema.safeParse(req.body);
    if (!p.success) {
      res.status(400).json({ error: "This link is invalid or expired." });
      return;
    }
    const token = db
      .prepare(
        "SELECT user_id FROM auth_tokens WHERE token_hash=? AND purpose='verify' AND expires_at>?",
      )
      .get(tokenHash(p.data.token), Date.now());
    if (!token) {
      res.status(400).json({ error: "This link is invalid or expired." });
      return;
    }
    db.exec("BEGIN");
    try {
      db.prepare("UPDATE users SET email_verified=1 WHERE id=?").run(
        token.user_id,
      );
      db.prepare(
        "DELETE FROM auth_tokens WHERE user_id=? AND purpose='verify'",
      ).run(token.user_id);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    res.json({ message: "Email verified." });
  });
  app.post("/api/auth/password/request", async (req, res) => {
    const p = emailSchema.safeParse(req.body);
    if (!p.success) {
      res.status(400).json({ error: "Enter a valid email address." });
      return;
    }
    if (mailer.delivery === "unavailable") {
      res.status(503).json({ error: "Email delivery is not configured." });
      return;
    }
    const u = db
      .prepare("SELECT id,email,email_verified FROM users WHERE email=?")
      .get(p.data.email) as Identity | undefined;
    if (u) {
      try {
        await service.issue(u, "reset");
      } catch {
        /* Same response regardless of account or delivery outcome: no account enumeration. */
      }
    }
    res.json({
      message: "If an account exists, a reset email will be prepared.",
      delivery: mailer.delivery,
    });
  });
  app.post("/api/auth/password/reset", (req, res) => {
    const p = tokenSchema
      .extend({ password: z.string().min(10).max(128) })
      .safeParse(req.body);
    if (!p.success) {
      res.status(400).json({
        error: "Enter a valid reset link and a password of 10–128 characters.",
      });
      return;
    }
    const token = db
      .prepare(
        "SELECT user_id FROM auth_tokens WHERE token_hash=? AND purpose='reset' AND expires_at>?",
      )
      .get(tokenHash(p.data.token), Date.now());
    if (!token) {
      res.status(400).json({ error: "This link is invalid or expired." });
      return;
    }
    const passwordHash = hashPassword(p.data.password);
    db.exec("BEGIN");
    try {
      db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(
        passwordHash,
        token.user_id,
      );
      db.prepare("DELETE FROM sessions WHERE user_id=?").run(token.user_id);
      db.prepare("DELETE FROM auth_tokens WHERE user_id=?").run(token.user_id);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    res.clearCookie("study_session", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
    res.json({ message: "Password reset. Sign in with your new password." });
  });
}
