import type { DatabaseSync } from "node:sqlite";
// Preserve the existing courses table name and all child relations while making
// it a shared workspace root. Personal spaces have no semester or credits.
export function migrateWorkspaces(db: DatabaseSync) {
  const columns = db.prepare("PRAGMA table_info(courses)").all();
  if (columns.some((c) => c.name === "kind")) return;
  db.exec("PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE");
  try {
    db.exec(`CREATE TABLE courses_next(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,semester_id TEXT,name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 100),code TEXT NOT NULL DEFAULT '',credits REAL NOT NULL DEFAULT 0 CHECK(credits>=0 AND credits<=30),color TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,kind TEXT NOT NULL DEFAULT 'course' CHECK(kind IN ('course','personal')),goal TEXT NOT NULL DEFAULT '',level TEXT NOT NULL DEFAULT 'beginner' CHECK(level IN ('beginner','intermediate','advanced')),target_date TEXT,UNIQUE(id,user_id),FOREIGN KEY(semester_id,user_id) REFERENCES semesters(id,user_id) ON DELETE CASCADE,CHECK((kind='course' AND semester_id IS NOT NULL) OR (kind='personal' AND semester_id IS NULL AND credits=0)));
INSERT INTO courses_next(id,user_id,semester_id,name,code,credits,color,created_at) SELECT id,user_id,semester_id,name,code,credits,color,created_at FROM courses;
DROP TABLE courses;ALTER TABLE courses_next RENAME TO courses;CREATE INDEX courses_semester ON courses(user_id,semester_id);CREATE INDEX workspaces_kind ON courses(user_id,kind);`);
    if (db.prepare("PRAGMA foreign_key_check").all().length)
      throw new Error("Workspace migration failed foreign key validation.");
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  } finally {
    db.exec("PRAGMA foreign_keys=ON");
  }
}
