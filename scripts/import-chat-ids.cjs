// One-off migration: decrypt the chat-id blob exported from the old Redis (key miku_monday:chat_ids,
// AES-256-CBC with a scrypt key, as written by server.js) and write SQL inserts for D1.
// Prints only the count; ids go to the output file, which must live somewhere gitignored.
//
//   CHAT_IDS_ENCRYPTION_KEY=... node scripts/import-chat-ids.cjs <blob-file> <out.sql>
//   npx wrangler d1 execute miku-monday --remote --file <out.sql>
const crypto = require('crypto');
const fs = require('fs');

const [blobFile, outFile] = process.argv.slice(2);
const secret = process.env.CHAT_IDS_ENCRYPTION_KEY;
if (!blobFile || !outFile || !secret) {
  console.error('usage: CHAT_IDS_ENCRYPTION_KEY=... node scripts/import-chat-ids.cjs <blob-file> <out.sql>');
  process.exit(2);
}

const [ivHex, ...rest] = fs.readFileSync(blobFile, 'utf8').trim().split(':');
const key = crypto.scryptSync(secret, 'salt', 32); // same derivation as server.js
const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'));
const ids = JSON.parse(decipher.update(rest.join(':'), 'hex', 'utf8') + decipher.final('utf8'));

const valid = ids.map(String).filter((id) => /^-?\d+$/.test(id));
const sql = valid.map((id) => `INSERT OR IGNORE INTO chats (chat_id) VALUES ('${id}');`).join('\n') + '\n';
fs.writeFileSync(outFile, sql);
console.log(`decrypted ${ids.length} chat ids, ${valid.length} valid; wrote inserts to ${outFile}`);
