export const migration = {
  id: 14,
  up(database) {
    database.exec(`
      DELETE FROM sessions;
      ALTER TABLE sessions ADD COLUMN last_seen_at INTEGER NOT NULL DEFAULT 0;
      CREATE INDEX idx_sessions_last_seen_at ON sessions(last_seen_at);
    `);
  },
};
