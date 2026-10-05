import { migrateWorkspaces } from "./workspaces";
import { aiSchema } from "./ai/routes";
import { practiceSchema } from "./practice";
import { plannerSchema } from "./planner";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
export function openDatabase(path: string) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS preferences (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      theme TEXT NOT NULL DEFAULT 'forest' CHECK(theme IN ('forest','ocean','lavender','rose','ember','midnight')),
      mode TEXT NOT NULL DEFAULT 'system' CHECK(mode IN ('light','dark','system')),
      language TEXT NOT NULL DEFAULT 'ar' CHECK(language IN ('ar','en')),
      track TEXT NOT NULL DEFAULT 'semester' CHECK(track IN ('semester','personal')),
      onboarded INTEGER NOT NULL DEFAULT 0 CHECK(onboarded IN (0,1))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    ); CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);`);
  const columns = db.prepare("PRAGMA table_info(users)").all() as {
    name: string;
  }[];
  if (!columns.some((c) => c.name === "email_verified"))
    db.exec(
      "ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0 CHECK(email_verified IN (0,1))",
    );
  db.exec(`CREATE TABLE IF NOT EXISTS semesters (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 80),start_date TEXT NOT NULL,end_date TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(id,user_id),CHECK(end_date>=start_date)
  );
  CREATE INDEX IF NOT EXISTS semesters_user ON semesters(user_id,start_date);
  CREATE TABLE IF NOT EXISTS courses (
    id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    semester_id TEXT NOT NULL,name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 100),code TEXT NOT NULL DEFAULT '',
    credits REAL NOT NULL CHECK(credits>=0 AND credits<=30),color TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(id,user_id),
    FOREIGN KEY(semester_id,user_id) REFERENCES semesters(id,user_id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS courses_semester ON courses(user_id,semester_id);
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id TEXT NOT NULL,title TEXT NOT NULL CHECK(length(title) BETWEEN 2 AND 160),due_date TEXT,
    completed_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(course_id,user_id) REFERENCES courses(id,user_id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS tasks_course ON tasks(user_id,course_id,due_date);
  CREATE TABLE IF NOT EXISTS auth_tokens (
    token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose TEXT NOT NULL CHECK(purpose IN ('verify','reset')),expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS auth_tokens_user ON auth_tokens(user_id,purpose);
  CREATE TABLE IF NOT EXISTS mail_limits (key TEXT PRIMARY KEY,next_at INTEGER NOT NULL);
  `);
  db.exec(`CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,user_id TEXT NOT NULL,course_id TEXT NOT NULL,name TEXT NOT NULL,
    FOREIGN KEY(course_id,user_id) REFERENCES courses(id,user_id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS folders_course ON folders(user_id,course_id);
  CREATE TABLE IF NOT EXISTS materials (
    id TEXT PRIMARY KEY,user_id TEXT NOT NULL,course_id TEXT NOT NULL,
    folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,name TEXT NOT NULL,mime TEXT NOT NULL,
    size INTEGER NOT NULL CHECK(size>0 AND size<=10485760),data BLOB NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(course_id,user_id) REFERENCES courses(id,user_id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS materials_course ON materials(user_id,course_id);
  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,user_id TEXT NOT NULL,course_id TEXT NOT NULL,title TEXT NOT NULL,html TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(course_id,user_id) REFERENCES courses(id,user_id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS notes_course ON notes(user_id,course_id,updated_at);
  `);
  db.exec(`CREATE TABLE IF NOT EXISTS exams (
    id TEXT PRIMARY KEY,user_id TEXT NOT NULL,course_id TEXT NOT NULL,name TEXT NOT NULL,start_at TEXT NOT NULL,
    weight REAL NOT NULL CHECK(weight>=0 AND weight<=100),total_mark REAL NOT NULL CHECK(total_mark>0),
    target_grade REAL NOT NULL CHECK(target_grade>=0 AND target_grade<=100),actual_grade REAL CHECK(actual_grade>=0 AND actual_grade<=total_mark),
    included_material TEXT NOT NULL DEFAULT '',
    FOREIGN KEY(course_id,user_id) REFERENCES courses(id,user_id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS exams_course ON exams(user_id,course_id,start_at);
  CREATE TABLE IF NOT EXISTS grade_items (
    id TEXT PRIMARY KEY,user_id TEXT NOT NULL,course_id TEXT NOT NULL,name TEXT NOT NULL,
    weight REAL NOT NULL CHECK(weight>=0 AND weight<=100),total REAL NOT NULL CHECK(total>0),score REAL CHECK(score>=0 AND score<=total),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(course_id,user_id) REFERENCES courses(id,user_id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS grades_course ON grade_items(user_id,course_id);
  CREATE TABLE IF NOT EXISTS academic_preferences (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    scale TEXT NOT NULL DEFAULT '4',max REAL NOT NULL DEFAULT 4,rules TEXT NOT NULL DEFAULT '[]'
  );
  `);
  migrateWorkspaces(db);
  plannerSchema(db);
  practiceSchema(db);
  aiSchema(db);
  return db;
}
