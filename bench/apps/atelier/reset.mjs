// Remet les données de l’atelier dans leur état initial (data/seed.json → data/db.json).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SEED_FILE = path.join(ROOT, 'data', 'seed.json');
const DB_FILE = path.resolve(ROOT, process.env.DATA_FILE || 'data/db.json');

JSON.parse(fs.readFileSync(SEED_FILE, 'utf8')); // s’arrête net si le fichier de départ est abîmé
fs.copyFileSync(SEED_FILE, DB_FILE);
fs.rmSync(`${DB_FILE}.tmp`, { force: true });
console.log(`Données remises à zéro : ${path.relative(ROOT, DB_FILE)} (copie de data/seed.json)`);
