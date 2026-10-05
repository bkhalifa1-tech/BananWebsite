import { Router, type Request } from "express";
import type { DatabaseSync } from "node:sqlite";
export type UserLookup = (
  req: Request,
) => { id: string; email_verified?: number } | undefined;
export function ownedRouter(
  db: DatabaseSync,
  userFor: UserLookup,
  requireVerified = false,
) {
  const router = Router();
  router.use((req, res, next) => {
    const u = userFor(req);
    if (!u) {
      res.status(401).json({ error: "Sign in required." });
      return;
    }
    if (requireVerified && !u.email_verified) {
      res
        .status(403)
        .json({ error: "Verify your email before accessing study data." });
      return;
    }
    res.locals.userId = u.id;
    next();
  });
  router.use("/courses/:id", (req, res, next) => {
    if (
      !db
        .prepare("SELECT id FROM courses WHERE id=? AND user_id=?")
        .get(req.params.id, res.locals.userId)
    ) {
      res.status(404).json({ error: "Course not found." });
      return;
    }
    res.locals.courseId = req.params.id;
    next();
  });
  return router;
}
