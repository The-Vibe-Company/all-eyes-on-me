// Remet data/db.json dans l’état du seed : node reset.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
fs.copyFileSync(path.join(dataDir, 'seed.json'), path.join(dataDir, 'db.json'));
console.log('data/db.json remis à l’état de data/seed.json.');
