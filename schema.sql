-- D1 schema for the Miku Monday Worker. Apply with:
--   npx wrangler d1 execute miku-monday --remote --file schema.sql
CREATE TABLE IF NOT EXISTS chats (
  chat_id  TEXT PRIMARY KEY,                       -- Telegram chat/channel id (as text: ids exceed 2^53 safely)
  added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
