import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(root, 'data'), { recursive: true });
copyFileSync(join(root, 'data', 'seed.json'), join(root, 'data', 'db.json'));
console.log('data/db.json remis à l\'état de data/seed.json');
