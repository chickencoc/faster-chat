import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { createUserUtils } from "../lib/db/users.js";
import { migrations } from "../lib/db/migrations/index.js";

test("migration revokes legacy sessions and new sessions store only a digest", () => {
  const database = new Database(":memory:");
  const realNow = Date.now;
  try {
    for (const migration of migrations.filter(({ id }) => id < 14)) migration.up(database);
    const users = createUserUtils({ db: database });
    const userId = users.createUser("session-test", "unused");
    database
      .prepare("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
      .run("legacy", userId, realNow() + 86400000, realNow());
    migrations.find(({ id }) => id === 14).up(database);
    expect(database.query("SELECT count(*) AS count FROM sessions").get().count).toBe(0);
    expect(users.getUserById(userId)).toBeTruthy();

    const minute = 60000;
    let now = Date.parse("2026-11-13T13:30:00Z");
    Date.now = () => now;
    const { sessionId, expiresAt } = users.createSession(userId);
    expect(expiresAt).toBe(Date.parse("2026-11-13T15:00:00Z"));
    const row = database.query("SELECT id FROM sessions").get();
    expect(row.id).toBe(createHash("sha256").update(sessionId).digest("hex"));
    expect(users.getSession(sessionId)?.user_id).toBe(userId);

    const idle = users.createSession(userId);
    now += 45 * minute;
    expect(users.getSession(idle.sessionId)).toBeTruthy();
    expect(users.getSession(sessionId, { touch: true })).toBeTruthy();
    now += 15 * minute;
    expect(users.getSession(idle.sessionId)).toBeNull();
    expect(users.cleanExpiredSessions()).toBe(1);
    expect(users.getSession(sessionId)).toBeTruthy();
    now = expiresAt;
    expect(users.getSession(sessionId, { touch: true })).toBeNull();

    const fresh = users.createSession(userId);
    expect(fresh.expiresAt).toBe(expiresAt + 24 * 60 * minute);
    users.deleteSession(fresh.sessionId);
    expect(users.getSession(fresh.sessionId)).toBeNull();
  } finally {
    Date.now = realNow;
    database.close();
  }
});
