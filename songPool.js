// Loads the song pool from Vocaloid_Combined.csv
// Columns used: 0 = Track URI, 1 = Track Name, 3 = Artist Name(s)

const fs = require('fs');
const path = require('path');

function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        // Peek ahead: escaped quote ("") or closing quote
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

function loadSongPool() {
  const csvPath = path.join(__dirname, 'Vocaloid_Combined.csv');
  const raw = fs.readFileSync(csvPath, 'utf8');
  const lines = raw.split('\n').slice(1); // skip header

  const songs = [];
  for (const line of lines) {
    const trimmed = line.trim().replace(/^\uFEFF/, ''); // strip BOM if present
    if (!trimmed) continue;

    const fields = parseCSVLine(trimmed);
    const uri = fields[0];    // e.g. spotify:track:XXXXX
    const title = fields[1];
    const artist = fields[3];

    if (!uri || !title || !artist) continue;

    const trackId = uri.replace('spotify:track:', '');
    songs.push({
      title,
      artist,
      url: `https://open.spotify.com/track/${trackId}`,
    });
  }

  return songs;
}

module.exports = loadSongPool();
