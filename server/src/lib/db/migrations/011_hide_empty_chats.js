export const migration = {
  id: 11,
  up(database) {
    database.exec(`
      UPDATE chats SET deleted_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
      WHERE deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM messages WHERE messages.chat_id = chats.id)
    `);
  },
};
