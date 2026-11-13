import { createHash, randomBytes } from "crypto";
import { DB_CONSTANTS } from "@faster-chat/shared";

const KST_OFFSET_MS = 9 * DB_CONSTANTS.MILLISECONDS_PER_HOUR;

function nextKoreaMidnight(now) {
  const day = DB_CONSTANTS.MILLISECONDS_PER_DAY;
  return (Math.floor((now + KST_OFFSET_MS) / day) + 1) * day - KST_OFFSET_MS;
}

function digestSessionToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function createUserUtils({ db }) {
  return {
    getUserByUsername(username) {
      const stmt = db.prepare("SELECT * FROM users WHERE username = ?");
      return stmt.get(username);
    },

    getUserById(userId) {
      const stmt = db.prepare("SELECT id, username, role, created_at FROM users WHERE id = ?");
      return stmt.get(userId);
    },

    createUser(username, passwordHash, role = "member", createdBy = null, email = null) {
      const stmt = db.prepare(
        "INSERT INTO users (username, password_hash, role, created_at, created_by, email) VALUES (?, ?, ?, ?, ?, ?)"
      );
      const result = stmt.run(username, passwordHash, role, Date.now(), createdBy, email);
      return result.lastInsertRowid;
    },

    getUserCount() {
      const stmt = db.prepare("SELECT COUNT(*) as count FROM users");
      const result = stmt.get();
      return result.count;
    },

    createSession(userId) {
      const sessionId = randomBytes(DB_CONSTANTS.SESSION_ID_BYTES).toString("hex");
      const now = Date.now();
      const expiresAt = nextKoreaMidnight(now);

      const stmt = db.prepare(
        "INSERT INTO sessions (id, user_id, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)"
      );
      stmt.run(digestSessionToken(sessionId), userId, expiresAt, now, now);

      return { sessionId, expiresAt };
    },

    getSession(sessionId, { touch = false } = {}) {
      const now = Date.now();
      const digest = digestSessionToken(sessionId);
      const stmt = db.prepare(`
      SELECT
        s.user_id,
        s.expires_at,
        s.last_seen_at,
        u.username,
        u.email,
        u.role
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.id = ? AND s.expires_at > ? AND s.last_seen_at > ?
    `);
      const session = stmt.get(digest, now, now - DB_CONSTANTS.SESSION_IDLE_TIMEOUT_MS);
      if (
        touch &&
        session &&
        now - session.last_seen_at >= DB_CONSTANTS.SESSION_TOUCH_INTERVAL_MS
      ) {
        db.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ? AND last_seen_at < ?").run(
          now,
          digest,
          now
        );
      }
      return session;
    },

    deleteSession(sessionId) {
      const stmt = db.prepare("DELETE FROM sessions WHERE id = ?");
      stmt.run(digestSessionToken(sessionId));
    },

    deleteUserSessions(userId) {
      const stmt = db.prepare("DELETE FROM sessions WHERE user_id = ?");
      stmt.run(userId);
    },

    cleanExpiredSessions() {
      const now = Date.now();
      const stmt = db.prepare("DELETE FROM sessions WHERE expires_at <= ? OR last_seen_at <= ?");
      const result = stmt.run(now, now - DB_CONSTANTS.SESSION_IDLE_TIMEOUT_MS);
      return result.changes;
    },

    getAllUsers() {
      const stmt = db.prepare(
        "SELECT id, username, role, created_at, last_active FROM users ORDER BY created_at DESC"
      );
      return stmt.all();
    },

    updateLastActive(userId) {
      const stmt = db.prepare("UPDATE users SET last_active = ? WHERE id = ?");
      stmt.run(Date.now(), userId);
    },

    updateUserRole(userId, role) {
      const stmt = db.prepare("UPDATE users SET role = ? WHERE id = ?");
      stmt.run(role, userId);
    },

    updateUserEmail(userId, email) {
      const stmt = db.prepare("UPDATE users SET email = ? WHERE id = ?");
      stmt.run(email, userId);
    },

    updateUserPassword(userId, passwordHash) {
      const stmt = db.prepare("UPDATE users SET password_hash = ? WHERE id = ?");
      stmt.run(passwordHash, userId);
    },

    deleteUser(userId) {
      const stmt = db.prepare("DELETE FROM users WHERE id = ?");
      stmt.run(userId);
    },
  };
}
