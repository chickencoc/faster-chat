import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { migrations } from "../lib/db/migrations/index.js";

test("provider cleanup disables removed services and preserves existing models and keys", () => {
  const database = new Database(":memory:");
  try {
    for (const migration of migrations.filter((item) => item.id < 10)) {
      migration.up(database);
    }
    const insert = database.prepare(`
      INSERT INTO providers (name, display_name, provider_type, encrypted_key, enabled, created_at, updated_at)
      VALUES (?, ?, 'official', 'saved-key', 1, 0, 0)
    `);
    for (const name of ["openai", "google", "anthropic", "ollama", "omlx", "azure", "replicate"]) {
      insert.run(name, name);
    }
    const provider = database.query("SELECT id FROM providers WHERE name = 'replicate'").get();
    database
      .prepare(
        `
      INSERT INTO models (provider_id, model_id, display_name, enabled, created_at, updated_at)
      VALUES (?, 'old-model', 'Old Model', 1, 0, 0)
    `
      )
      .run(provider.id);

    migrations.find((item) => item.id === 10).up(database);

    const rows = database.query("SELECT name, enabled, encrypted_key FROM providers").all();
    expect(
      rows
        .filter((row) => row.enabled)
        .map((row) => row.name)
        .sort()
    ).toEqual(["openai", "google", "anthropic", "ollama", "omlx"].sort());
    expect(rows.every((row) => row.encrypted_key === "saved-key")).toBe(true);
    expect(database.query("SELECT model_id FROM models").get().model_id).toBe("old-model");
  } finally {
    database.close();
  }
});

test("empty chat cleanup preserves conversations and previous deletion timestamps", () => {
  const database = new Database(":memory:");
  try {
    for (const migration of migrations.filter((item) => item.id < 11)) {
      migration.up(database);
    }
    database.exec(`
      INSERT INTO users (id, username, password_hash, created_at) VALUES (1, 'test', 'hash', 0);
      INSERT INTO chats (id, user_id, created_at, updated_at, deleted_at) VALUES
        ('empty', 1, 0, 0, NULL), ('started', 1, 0, 0, NULL), ('deleted', 1, 0, 0, 123);
      INSERT INTO messages (id, chat_id, user_id, role, content, created_at)
        VALUES ('message', 'started', 1, 'user', 'Hello', 0);
    `);
    migrations.find((item) => item.id === 11).up(database);
    expect(database.query("SELECT id FROM chats WHERE deleted_at IS NULL").all()).toEqual([
      { id: "started" },
    ]);
    expect(
      database.query("SELECT deleted_at FROM chats WHERE id = 'deleted'").get().deleted_at
    ).toBe(123);
    expect(database.query("SELECT COUNT(*) AS count FROM chats").get().count).toBe(3);
    expect(database.query("SELECT content FROM messages").get().content).toBe("Hello");
  } finally {
    database.close();
  }
});

test("chat model settings migrate the last recorded model of each type", () => {
  const database = new Database(":memory:");
  try {
    for (const migration of migrations.filter((item) => item.id < 12)) {
      migration.up(database);
    }
    database.exec(`
      INSERT INTO users (id, username, password_hash, created_at) VALUES (1, 'test', 'hash', 0);
      INSERT INTO providers (id, name, display_name, provider_type, created_at, updated_at)
        VALUES (1, 'openai', 'OpenAI', 'official', 0, 0);
      INSERT INTO models (provider_id, model_id, display_name, model_type, created_at, updated_at)
        VALUES (1, 'old', 'Old', 'text', 0, 0), (1, 'text', 'Text', 'text', 0, 0),
               (1, 'image', 'Image', 'image', 0, 0);
      INSERT INTO chats (id, user_id, created_at, updated_at) VALUES ('chat', 1, 0, 0);
      INSERT INTO messages (id, chat_id, user_id, role, content, model, created_at)
        VALUES ('1', 'chat', 1, 'user', 'Hello', 'old', 0),
               ('2', 'chat', 1, 'user', 'Hello', 'text', 1),
               ('3', 'chat', 1, 'assistant', 'Image', 'image', 2);
    `);

    migrations.find((item) => item.id === 12).up(database);
    expect(database.query("SELECT * FROM chats WHERE id = 'chat'").get()).toMatchObject({
      last_model: "text",
      last_image_model: "image",
      reasoning_effort: null,
      image_complexity: null,
      updated_at: 0,
    });
  } finally {
    database.close();
  }
});
