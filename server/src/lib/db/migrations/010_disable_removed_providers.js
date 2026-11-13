export const migration = {
  id: 10,
  up(database) {
    database.exec(`
      UPDATE providers SET enabled = 0
      WHERE name IN (
        'azure', 'google-vertex', 'amazon-bedrock', 'mistral', 'groq',
        'cohere', 'xai', 'deepseek', 'cerebras', 'fireworks', 'openrouter', 'replicate'
      )
    `);
  },
};
