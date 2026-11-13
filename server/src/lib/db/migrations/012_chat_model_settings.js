export const migration = {
  id: 12,
  up(database) {
    database.exec(`
      ALTER TABLE chats ADD COLUMN last_model TEXT;
      ALTER TABLE chats ADD COLUMN reasoning_effort TEXT;
      ALTER TABLE chats ADD COLUMN last_image_model TEXT;
      ALTER TABLE chats ADD COLUMN image_complexity TEXT;

      UPDATE chats SET
        last_model = (
          SELECT messages.model FROM messages
          WHERE messages.chat_id = chats.id AND messages.model IN (
            SELECT model_id FROM models WHERE COALESCE(model_type, 'text') = 'text'
          )
          ORDER BY messages.created_at DESC, messages.rowid DESC LIMIT 1
        ),
        last_image_model = (
          SELECT messages.model FROM messages
          WHERE messages.chat_id = chats.id AND messages.model IN (
            SELECT model_id FROM models WHERE model_type = 'image'
          )
          ORDER BY messages.created_at DESC, messages.rowid DESC LIMIT 1
        )
      WHERE deleted_at IS NULL
    `);
  },
};
