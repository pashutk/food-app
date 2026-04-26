import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default async function globalSetup() {
  const dbPath = path.resolve(__dirname, '../backend/data/test.db');
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }
}
