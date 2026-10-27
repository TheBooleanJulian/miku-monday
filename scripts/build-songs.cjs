// Regenerates songs.json from Vocaloid_Combined.csv (via songPool.js) for the Worker,
// which can't read files at runtime. Run after editing the CSV: node scripts/build-songs.cjs
const fs = require('fs');
const path = require('path');

const songs = require('../songPool.js');
fs.writeFileSync(path.join(__dirname, '..', 'songs.json'), JSON.stringify(songs));
console.log(`songs.json: ${songs.length} songs`);
